'use strict';
const { protocol } = require('electron');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const path = require('node:path');

// Serve local audio/artwork without disabling Chromium's web security.
function registerMediaProtocol(isAllowed) {
  protocol.handle('aura-media', async request => {
    try {
      const url = new URL(request.url);
      const file = decodeURIComponent(url.pathname.slice(1));
      if (url.hostname !== 'media' || !path.isAbsolute(file) || !isAllowed(file)) {
        return new Response('Not found', { status: 404 });
      }
      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) return new Response('Not found', {status:404});
      const types={'.wav':'audio/wav','.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.mp4':'audio/mp4','.m4b':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.opus':'audio/ogg','.wma':'audio/x-ms-wma','.aif':'audio/aiff','.aiff':'audio/aiff','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.bmp':'image/bmp'};
      const headers=new Headers({'Access-Control-Allow-Origin':'*','Accept-Ranges':'bytes','Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream'});
      let start=0,end=stat.size-1,status=200;
      const range=request.headers.get('range');
      if(range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(range);
        if(!match || (!match[1]&&!match[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});
        if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
        else start=Math.max(0,stat.size-Number(match[2]));
        if(start>end||start>=stat.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});
        status=206;headers.set('Content-Range',`bytes ${start}-${end}/${stat.size}`);
      }
      headers.set('Content-Length',String(Math.max(0,end-start+1)));
      const body=request.method==='HEAD'||!stat.size?null:Readable.toWeb(fs.createReadStream(file,{start,end}));
      return new Response(body,{status,headers});
    } catch {
      return new Response('Media unavailable', { status: 404 });
    }
  });
}
module.exports = { registerMediaProtocol };
