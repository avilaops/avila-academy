// SQLite remains the pilot storage. Only the chunks overlapping the requested range are read.
export async function serveMedia(db,req,res,item) {
  let start=0;
  let end=item.bytes-1;
  const range=req.headers.range;
  if(range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match || (!match[1]&&!match[2])) {
      res.writeHead(416,{'Content-Range':'bytes */'+item.bytes}).end();return;
    }
    if(!match[1]) start=Math.max(0,item.bytes-Number(match[2]));
    else {start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=item.bytes) {
      res.writeHead(416,{'Content-Range':'bytes */'+item.bytes}).end();return;
    }
  }
  const headers={'Content-Type':item.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes'};
  if(range)headers['Content-Range']='bytes '+start+'-'+end+'/'+item.bytes;
  res.writeHead(range?206:200,headers);
  let offset=0;
  const chunks=db.prepare('SELECT number,length(data) AS bytes FROM chunks WHERE recording=? ORDER BY number').all(item.id);
  for(const chunk of chunks) {
    if(res.destroyed)break;
    const chunkEnd=offset+chunk.bytes-1;
    if(chunkEnd>=start && offset<=end) {
      const from=Math.max(0,start-offset);
      const length=Math.min(chunkEnd,end)-Math.max(offset,start)+1;
      const row=db.prepare('SELECT substr(data,?,?) AS data FROM chunks WHERE recording=? AND number=?').get(from+1,length,item.id,chunk.number);
      if(!res.write(row.data)) {
        await new Promise(resolve=>{
          const done=()=>{res.off('drain',done);res.off('close',done);resolve();};
          res.once('drain',done);res.once('close',done);
        });
      }
    }
    offset+=chunk.bytes;
    if(offset>end)break;
  }
  res.end();
}
