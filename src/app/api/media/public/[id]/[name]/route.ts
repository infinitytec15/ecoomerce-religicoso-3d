import { NextResponse } from 'next/server';
export async function GET(_request:Request,context:{params:Promise<{id:string;name:string}>}) {
  const {id,name}=await context.params;
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||!['image.webp','preview.glb','video'].includes(name))return new NextResponse(null,{status:404});
  const base=process.env.API_BASE_URL;if(!base)return new NextResponse(null,{status:503});
  try{const upstream=await fetch(base.replace(/\/$/,'')+'/media/public/'+id+'/'+name,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!upstream.ok)return new NextResponse(null,{status:upstream.status});const mime=upstream.headers.get('content-type')||'application/octet-stream';if(!/^(image\/webp|model\/gltf-binary|video\/(mp4|webm|quicktime))($|;)/.test(mime))return new NextResponse(null,{status:502});return new NextResponse(upstream.body,{headers:{'Content-Type':mime,'Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}});}catch{return new NextResponse(null,{status:503});}
}
