/** 後台圖片上傳（Logo／封面／編輯器圖片）：≤1MB，先在瀏覽器擋、伺服器 /api/admin/content/upload 再擋一次；回公開網址。 */
export const UPLOAD_MAX_BYTES = 1024 * 1024;
export const UPLOAD_LIMIT_LABEL = '1MB';

export function checkUploadSize(file: File) {
  if (file.size > UPLOAD_MAX_BYTES) throw new Error(`圖片需 ${UPLOAD_LIMIT_LABEL} 以內（目前 ${(file.size / 1024 / 1024).toFixed(2)} MB），請先壓縮或縮小尺寸`);
  if (!file.type.startsWith('image/')) throw new Error('只接受圖片檔');
}

export async function uploadImage(file: File): Promise<string> {
  checkUploadSize(file);
  const dataBase64 = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const r = await fetch('/api/admin/content/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : '上傳失敗');
  return j.url as string;
}
