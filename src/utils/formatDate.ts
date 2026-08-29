/** Định dạng ngày kiểu Việt Nam (DD/MM/YYYY) từ chuỗi ISO của WordPress (`date`, `date_gmt`). */
export function formatVietnameseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
