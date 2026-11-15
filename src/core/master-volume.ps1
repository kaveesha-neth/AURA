$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
# A persistent bridge to the default Windows output endpoint. No per-app mixer API.
Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Web.Script.Serialization;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class DeviceEnumerator { }
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceEnumerator {
    void EnumAudioEndpoints(int flow, uint mask, out IDeviceCollection devices);
    void GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDevice {
    void Activate(ref Guid id, uint context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result);
    void OpenPropertyStore(uint access, out IPropertyStore properties);
    void GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDeviceCollection { void GetCount(out uint count); void Item(uint index, out IDevice device); }
[StructLayout(LayoutKind.Sequential)]
struct PropertyKey { public Guid format; public uint id; }
[StructLayout(LayoutKind.Explicit, Size=24)]
struct PropertyValue { [FieldOffset(0)] public ushort type; [FieldOffset(8)] public IntPtr value; }
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore {
    void GetCount(out uint count); void GetAt(uint index, out PropertyKey key);
    void GetValue(ref PropertyKey key, out PropertyValue value);
}
[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
class PolicyConfig { }
[ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPolicyConfig {
    void Unused1(); void Unused2(); void Unused3(); void Unused4(); void Unused5();
    void Unused6(); void Unused7(); void Unused8(); void Unused9(); void Unused10();
    void SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
}
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IEndpointVolume {
    void RegisterControlChangeNotify(IntPtr callback);
    void UnregisterControlChangeNotify(IntPtr callback);
    void GetChannelCount(out uint count);
    void SetMasterVolumeLevel(float level, ref Guid context);
    void SetMasterVolumeLevelScalar(float level, ref Guid context);
    void GetMasterVolumeLevel(out float level);
    void GetMasterVolumeLevelScalar(out float level);
    void SetChannelVolumeLevel(uint channel, float level, ref Guid context);
    void SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
    void GetChannelVolumeLevel(uint channel, out float level);
    void GetChannelVolumeLevelScalar(uint channel, out float level);
    void SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
    void GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
}
public static class AuraMasterVolume {
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropertyValue value);
    static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
    static List<object> Outputs(IDeviceEnumerator enumerator, string current) {
        var result = new List<object>(); IDeviceCollection collection = null;
        try {
            enumerator.EnumAudioEndpoints(0, 1, out collection);
            uint count; collection.GetCount(out count);
            for (uint i=0; i<count; i++) {
                IDevice device = null; IPropertyStore properties = null;
                try {
                    collection.Item(i, out device); string id; device.GetId(out id);
                    device.OpenPropertyStore(0, out properties);
                    var key = new PropertyKey { format = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), id=14 };
                    PropertyValue value; properties.GetValue(ref key, out value);
                    string name;
                    try { name = value.type == 31 ? Marshal.PtrToStringUni(value.value) : "Audio output"; } finally { PropVariantClear(ref value); }
                    result.Add(new { id=id, name=name, isDefault=id==current });
                } catch { } finally { Release(properties); Release(device); }
            }
        } finally { Release(collection); }
        return result;
    }
    public static void Run() {
        IEndpointVolume endpoint = null;
        string deviceId = null, last = null;
        var json = new JavaScriptSerializer(); var outputs = new List<object>(); int tick = 0;
        Guid volumeId = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        Guid context = Guid.Empty;
        var input = new BlockingCollection<string>();
        var reader = new Thread(() => {
            try { string line; while ((line = Console.In.ReadLine()) != null) input.Add(line); }
            finally { input.Add("__EOF"); }
        });
        reader.IsBackground = true; reader.Start();
        try {
            while (true) {
                string command;
                input.TryTake(out command, 100);
                if (command == "__EOF") return;
                object enumerator = null;
                IDevice device = null;
                try {
                    enumerator = new DeviceEnumerator();
                    ((IDeviceEnumerator)enumerator).GetDefaultAudioEndpoint(0, 1, out device);
                    string id; device.GetId(out id);
                    string outputError = null;
                    if (command != null && command.StartsWith("output:")) {
                        object policy = null;
                        try {
                            string requested = command.Substring(7);
                            // Only IDs supplied by active endpoint enumeration are accepted by the host.
                            policy = new PolicyConfig();
                            ((IPolicyConfig)policy).SetDefaultEndpoint(requested, 0);
                            ((IPolicyConfig)policy).SetDefaultEndpoint(requested, 1);
                        } catch { outputError = "Windows could not switch this output. Use Windows sound settings."; }
                        finally { Release(policy); }
                        Release(device); device = null;
                        ((IDeviceEnumerator)enumerator).GetDefaultAudioEndpoint(0, 1, out device); device.GetId(out id);
                    }
                    if (tick++ % 10 == 0 || id != deviceId || (command != null && command.StartsWith("output:"))) {
                        try { outputs = Outputs((IDeviceEnumerator)enumerator, id); } catch { outputs = new List<object>(); }
                    }
                    if (id != deviceId || endpoint == null) {
                        Release(endpoint); endpoint = null;
                        object activated;
                        device.Activate(ref volumeId, 23, IntPtr.Zero, out activated);
                        endpoint = (IEndpointVolume)activated; deviceId = id;
                        last = null;
                    }
                    float value;
                    if (command != null && command.StartsWith("volume:") &&
                        float.TryParse(command.Substring(7), NumberStyles.Float, CultureInfo.InvariantCulture, out value) &&
                        !float.IsNaN(value) && !float.IsInfinity(value)) {
                        endpoint.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(1, value)), ref context);
                        endpoint.SetMute(false, ref context);
                    } else if (command == "mute:toggle") {
                        bool muted; endpoint.GetMute(out muted);
                        endpoint.SetMute(!muted, ref context);
                    }
                    float level; bool mute;
                    endpoint.GetMasterVolumeLevelScalar(out level); endpoint.GetMute(out mute);
                    string state = json.Serialize(new { available=true, volume=Math.Round(level,4), muted=mute, outputs=outputs, outputError=outputError });
                    if (state != last || command != null) { Console.WriteLine(state); Console.Out.Flush(); last = state; }
                } catch {
                    Release(endpoint); endpoint = null; deviceId = null;
                    string state = "{\"available\":false}";
                    if (last != state || command != null) { Console.WriteLine(state); Console.Out.Flush(); last = state; }
                } finally { Release(device); Release(enumerator); }
            }
        } finally { Release(endpoint); }
    }
}
'@
[AuraMasterVolume]::Run()
