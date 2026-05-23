/**
 * Loại bỏ dấu tiếng Việt để phục vụ tìm kiếm không dấu
 */
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  let result = str.normalize('NFD');
  result = result.replace(/[\u0300-\u036f]/g, '');
  result = result.replace(/đ/g, 'd');
  result = result.replace(/Đ/g, 'D');
  // Loại bỏ một số ký tự đặc biệt hoặc dấu phụ khác nếu cần
  return result;
}

/**
 * Lọc tìm kiếm thông minh hỗ trợ viết nhiều từ cách nhau, không dấu và không phân biệt chữ hoa thường
 * @param item Đối tượng cần kiểm tra
 * @param fields Các trường thông tin (chuỗi) cần so khớp
 * @param query Từ khóa tìm kiếm
 */
export function matchSmartSearch(item: Record<string, unknown>, fields: string[], query: string): boolean {
  if (!query || query.trim() === '') return true;
  
  const normalizedQuery = removeVietnameseTones(query.trim().toLowerCase());
  const keywords = normalizedQuery.split(/\s+/).filter(Boolean);
  
  if (keywords.length === 0) return true;
  
  // Lấy danh sách các giá trị đã được chuyển thành chuỗi và xóa dấu từ đối tượng
  const normalizedFieldValues = fields.map(field => {
    const val = item[field];
    return removeVietnameseTones(String(val || '').toLowerCase());
  });
  
  // TẤT CẢ các từ khóa tìm kiếm (phân tách bởi khoảng trắng) đều phải khớp với ÍT NHẤT một trường thông tin nào đó
  return keywords.every(keyword => 
    normalizedFieldValues.some(val => val.includes(keyword))
  );
}
