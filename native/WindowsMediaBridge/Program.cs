using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Windows.ApplicationModel;
using Windows.Media;
using Windows.Media.Control;
using Windows.Storage.Streams;
using Session = Windows.Media.Control.GlobalSystemMediaTransportControlsSession;

// All WinRT work is serialized; notifications only enqueue a refresh.
internal static class Program
{
    static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    static readonly Channel<Func<Task>> Work = Channel.CreateUnbounded<Func<Task>>(new() { SingleReader = true });
    static readonly Dictionary<Session, Entry> Entries = new();
    static readonly Dictionary<string, Entry> Ids = new();
    static readonly object Gate = new();
    static GlobalSystemMediaTransportControlsSessionManager? manager;
    static DateTime nextConnect;
    static string? error, diagnostic;
    static string lastSnapshot = "";
    static bool queued;
    static void Write(object value) => Console.WriteLine(JsonSerializer.Serialize(value, Json));
    static void Diagnose(string operation, Exception exception)
    {
        diagnostic = $"{operation}: {exception.GetType().Name} (0x{exception.HResult:X8}): {exception.Message.Replace('\r', ' ').Replace('\n', ' ')}";
        Console.Error.WriteLine(diagnostic);
    }
    static void Schedule()
    {
        lock (Gate) { if (queued) return; queued = true; }
        Work.Writer.TryWrite(async () => { lock (Gate) queued = false; await Refresh(); });
    }
    static async Task Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false); Console.InputEncoding = new UTF8Encoding(false);
        try
        {
            await Connect(); Schedule();
            var input = Task.Run(async () =>
            {
                string? line;
                while ((line = await Console.In.ReadLineAsync()) != null)
                {
                    try
                    {
                        if (line.Length > 8192) continue;
                        var command = JsonSerializer.Deserialize<Command>(line, Json);
                        if (command != null) Work.Writer.TryWrite(() => Execute(command));
                    }
                    catch (Exception ex) { Diagnose("Read command", ex); }
                }
                Work.Writer.TryComplete();
            });
            using var timer = new Timer(_ => Schedule(), null, 1000, 1000);
            await foreach (var work in Work.Reader.ReadAllAsync())
                try { await work(); } catch (Exception ex) { Diagnose("Refresh sessions", ex); }
            await input;
        }
        catch (Exception ex) { Diagnose("Media bridge", ex); Environment.ExitCode = 1; }
        finally { Disconnect(); ClearEntries(); }
    }
    static void Changed(GlobalSystemMediaTransportControlsSessionManager sender, SessionsChangedEventArgs args) => Schedule();
    static void CurrentChanged(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args) => Schedule();
    static void Disconnect()
    {
        if (manager == null) return;
        manager.SessionsChanged -= Changed; manager.CurrentSessionChanged -= CurrentChanged; manager = null;
    }
    static void ClearEntries() { foreach (var entry in Entries.Values) entry.Dispose(); Entries.Clear(); Ids.Clear(); }
    static async Task Connect()
    {
        nextConnect = DateTime.UtcNow.AddSeconds(10);
        try
        {
            manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(4));
            manager.SessionsChanged += Changed; manager.CurrentSessionChanged += CurrentChanged;
            error = null; diagnostic = null;
        }
        catch (Exception ex)
        {
            manager = null; error = ex is UnauthorizedAccessException ? "access-denied" : "unavailable";
            Diagnose("Connect Windows media", ex);
        }
    }
    sealed class Entry : IDisposable
    {
        public Session Session { get; }
        public string Id { get; } = Guid.NewGuid().ToString("N");
        public string Source { get; }
        public string AppName { get; }
        public bool Dirty = true;
        public string Title = "", Artist = "", Album = "", Thumbnail = "";
        public Entry(Session session)
        {
            Session = session; Source = session.SourceAppUserModelId; AppName = FriendlyName(Source);
            session.MediaPropertiesChanged += Metadata; session.PlaybackInfoChanged += Playback; session.TimelinePropertiesChanged += Timeline;
        }
        void Metadata(Session sender, MediaPropertiesChangedEventArgs args) { Dirty = true; Schedule(); }
        void Playback(Session sender, PlaybackInfoChangedEventArgs args) => Schedule();
        void Timeline(Session sender, TimelinePropertiesChangedEventArgs args) => Schedule();
        public void Dispose() { Session.MediaPropertiesChanged -= Metadata; Session.PlaybackInfoChanged -= Playback; Session.TimelinePropertiesChanged -= Timeline; }
        public async Task Read()
        {
            if (!Dirty) return;
            Dirty = false;
            try
            {
                var properties = await Session.TryGetMediaPropertiesAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
                Title = properties.Title; Artist = properties.Artist; Album = properties.AlbumTitle; Thumbnail = "";
                if (properties.Thumbnail == null) return;
                try
                {
                    using var stream = await properties.Thumbnail.OpenReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(3));
                    if (stream.Size == 0 || stream.Size > 2 * 1024 * 1024) return;
                    using var reader = new DataReader(stream.GetInputStreamAt(0));
                    await reader.LoadAsync((uint)stream.Size).AsTask().WaitAsync(TimeSpan.FromSeconds(3));
                    var bytes = new byte[(int)stream.Size]; reader.ReadBytes(bytes);
                    if (stream.ContentType is "image/jpeg" or "image/png" or "image/webp" or "image/bmp") Thumbnail = $"data:{stream.ContentType};base64,{Convert.ToBase64String(bytes)}";
                }
                catch (Exception ex) { Diagnose("Read media artwork", ex); }
            }
            catch (Exception ex) { Dirty = true; Diagnose("Read media metadata", ex); }
        }
    }
    static string FriendlyName(string source)
    {
        if (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041))
            try { var name = AppInfo.GetFromAppUserModelId(source).DisplayInfo.DisplayName; if (!string.IsNullOrWhiteSpace(name)) return name; } catch { }
        var lower = source.ToLowerInvariant();
        if (lower.Contains("chrome")) return "Google Chrome";
        if (lower.Contains("msedge")) return "Microsoft Edge";
        if (lower.Contains("firefox")) return "Firefox";
        if (lower.Contains("spotify")) return "Spotify";
        if (lower.Contains("vlc")) return "VLC media player";
        return source.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? Path.GetFileNameWithoutExtension(source) : source;
    }
    static bool IsAura(string source) => source.Equals("com.aura.musicplayer3", StringComparison.OrdinalIgnoreCase) || source.Equals("AURA", StringComparison.OrdinalIgnoreCase) || source.EndsWith("AURA.exe", StringComparison.OrdinalIgnoreCase) || source.Equals("AURA 3.0", StringComparison.OrdinalIgnoreCase) || source.EndsWith("AURA-3.0.exe", StringComparison.OrdinalIgnoreCase);
    static async Task Refresh()
    {
        if (manager == null && DateTime.UtcNow >= nextConnect) await Connect();
        Session[] sessions;
        Session? current;
        try { sessions = manager?.GetSessions().Where(s => !IsAura(s.SourceAppUserModelId)).Take(100).ToArray() ?? []; current = manager?.GetCurrentSession(); }
        catch (Exception ex) { Diagnose("Enumerate Windows media", ex); Disconnect(); ClearEntries(); error = "unavailable"; sessions = []; current = null; }
        foreach (var session in Entries.Keys.Except(sessions).ToArray()) { Ids.Remove(Entries[session].Id); Entries[session].Dispose(); Entries.Remove(session); }
        foreach (var session in sessions)
        {
            if (Entries.ContainsKey(session)) continue;
            try { var entry = new Entry(session); Entries.Add(session, entry); Ids.Add(entry.Id, entry); }
            catch (Exception ex) { Diagnose("Subscribe to media session", ex); }
        }
        var cards = new List<object>(); string currentId = "";
        foreach (var entry in Entries.Values)
        {
            await entry.Read(); // Metadata failures retain a controllable app card.
            try
            {
                var info = entry.Session.GetPlaybackInfo(); var timeline = entry.Session.GetTimelineProperties(); var c = info.Controls;
                if (entry.Session == current || (currentId == "" && entry.Source == current?.SourceAppUserModelId)) currentId = entry.Id;
                cards.Add(new { id = entry.Id, source = entry.Source, appName = entry.AppName, title = entry.Title, artist = entry.Artist, album = entry.Album, thumbnail = entry.Thumbnail,
                    playing = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing,
                    position = Math.Max(0, timeline.Position.TotalSeconds), start = Math.Max(0, timeline.StartTime.TotalSeconds), end = Math.Max(0, timeline.EndTime.TotalSeconds),
                    updatedAt = timeline.LastUpdatedTime.ToUnixTimeMilliseconds(), rate = info.PlaybackRate ?? 1, shuffle = info.IsShuffleActive ?? false, repeat = (int)(info.AutoRepeatMode ?? MediaPlaybackAutoRepeatMode.None),
                    controls = new { play = c.IsPlayEnabled || c.IsPlayPauseToggleEnabled, pause = c.IsPauseEnabled || c.IsPlayPauseToggleEnabled, next = c.IsNextEnabled, previous = c.IsPreviousEnabled, seek = c.IsPlaybackPositionEnabled, shuffle = c.IsShuffleEnabled, repeat = c.IsRepeatEnabled } });
            }
            catch (Exception ex) { Diagnose("Read media playback state", ex); }
        }
        var snapshot = JsonSerializer.Serialize(new { available = manager != null, sessions = cards, current = currentId, error, diagnostic, bridge = "dotnet8" }, Json);
        if (snapshot != lastSnapshot) { lastSnapshot = snapshot; Console.WriteLine(snapshot); }
    }
    sealed record Command(int RequestId, string SessionId, string Action, double? Value);
    static Task<bool> Control(Windows.Foundation.IAsyncOperation<bool> operation) => operation.AsTask().WaitAsync(TimeSpan.FromSeconds(3));
    static async Task Execute(Command command)
    {
        bool ok = false; string? failure = null;
        try
        {
            if (!Ids.TryGetValue(command.SessionId, out var entry)) throw new InvalidOperationException("The media session has closed.");
            var s = entry.Session; var info = s.GetPlaybackInfo(); var c = info.Controls;
            var playing = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            switch (command.Action)
            {
                case "play" when c.IsPlayEnabled: ok = await Control(s.TryPlayAsync()); break;
                case "pause" when c.IsPauseEnabled: ok = await Control(s.TryPauseAsync()); break;
                case "play" when c.IsPlayPauseToggleEnabled: ok = playing || await Control(s.TryTogglePlayPauseAsync()); break;
                case "pause" when c.IsPlayPauseToggleEnabled: ok = !playing || await Control(s.TryTogglePlayPauseAsync()); break;
                case "next" when c.IsNextEnabled: ok = await Control(s.TrySkipNextAsync()); break;
                case "previous" when c.IsPreviousEnabled: ok = await Control(s.TrySkipPreviousAsync()); break;
                case "seek" when c.IsPlaybackPositionEnabled && command.Value is double value && double.IsFinite(value):
                    var timeline = s.GetTimelineProperties();
                    var seconds = Math.Clamp(value, timeline.StartTime.TotalSeconds, Math.Max(timeline.StartTime.TotalSeconds, timeline.EndTime.TotalSeconds));
                    ok = await Control(s.TryChangePlaybackPositionAsync(TimeSpan.FromSeconds(seconds).Ticks)); break;
                case "shuffle" when c.IsShuffleEnabled: ok = await Control(s.TryChangeShuffleActiveAsync(!(info.IsShuffleActive ?? false))); break;
                case "repeat" when c.IsRepeatEnabled: ok = await Control(s.TryChangeAutoRepeatModeAsync((MediaPlaybackAutoRepeatMode)(((int)(info.AutoRepeatMode ?? MediaPlaybackAutoRepeatMode.None) + 1) % 3))); break;
            }
            if (!ok) failure = "The selected app declined this control.";
        }
        catch (Exception ex) { Diagnose("Control media session", ex); failure = diagnostic; }
        Write(new { reply = command.RequestId, ok, error = failure }); Schedule();
    }
}
