# Nghiệm thu phần quét QR — Codex

Cập nhật kiểm tra bản gộp: xem `docs/kiem-tra-ban-tong-hop-truoc-deploy.md`. Bản tổng hợp đã qua 191 unit test, lint và build nhưng còn ba lỗi quản trị được tái hiện; chưa deploy.

Ngày: 21/09/2026. Phạm vi: kiểm kê, báo hỏng/sửa chữa, luân chuyển.

## Kết quả

Đã tích hợp màn quét dùng chung vào ba nghiệp vụ. Bản sửa nằm trong workspace, chưa commit, push hoặc deploy. Không thay đổi backend hoặc mẫu in QR.

- Điện thoại dùng màn quét toàn màn hình; máy tính dùng hộp thoại. Có camera, ảnh và nhập mã.
- Nhận diện thiết bị trước, người dùng xác nhận sau; không tự tạo phiếu khi nhận mã.
- Kiểm kê phân biệt lưu tạm với đồng bộ, giữ dữ liệu khi máy chủ lỗi, chặn xác nhận lại thiết bị đã ghi nhận.
- Sửa chữa giữ mô tả và các trường bản nháp khi chọn thiết bị.
- Luân chuyển giữ quy trình mượn theo loại máy: quét giúp chọn loại, admin vẫn quyết định máy cụ thể. Không bật thêm quy trình trả máy hoặc thay đổi duyệt phiếu.
- Khớp chính xác ID, serial, bí danh phân cách chấm phẩy và URL tem hiện tại; không chọn ngẫu nhiên khi trùng mã, không tự mở URL từ nội dung QR.

## Các vấn đề trong bản Antigravity đã được Codex sửa

1. Thiếu kiểu `DeviceData`, sử dụng biến trước khai báo khiến build lỗi.
2. Effect camera phụ thuộc kết quả nhận diện khiến thẻ kết quả bị xóa. Hai kiểm thử trình duyệt ban đầu đã tái hiện lỗi trước khi sửa.
3. Khởi động/dừng camera chưa tuần tự và quét ảnh chưa chặn kết quả muộn. Đã tuần tự hóa thao tác, vô hiệu callback cũ, cleanup khi đóng/unmount/đổi nguồn; dừng khi trang ẩn.
4. Bản bàn giao thêm chuyển đổi mượn/trả ngoài phạm vi; đã bỏ phần này.
5. Thiếu quản lý focus, khóa cuộn nền và trả focus trên WebKit. Đã dùng portal, giữ focus trong hộp thoại và trả về nút mở.
6. Bố cục camera chưa chiếm đủ màn hình và thẻ kết quả để khoảng nền đen lớn. Đã sửa bố cục mobile, nút thao tác và vùng hiển thị kết quả.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 187/187 đạt |
| `npm run lint` | Đạt, mã thoát 0 |
| `npm run build` | Đạt, mã thoát 0 |
| `e2e/qr-scanner.spec.ts` | 18/18 đạt: Chromium máy tính, Chromium điện thoại, WebKit điện thoại |
| `e2e/security-and-resilience.spec.ts` | 54/54 đạt trong đợt hồi quy kết hợp |

Các ca QR kiểm tra giữ bản nháp, xác nhận trước khi điền thiết bị, không tự gửi phiếu, mã trùng, không khớp một phần, lỗi camera, camera khởi động rồi đóng/mở lại, callback ảnh muộn, quét lặp, lưu tạm khi đồng bộ lỗi và trả focus. Ca đọc ảnh sử dụng ảnh QR thật sinh từ trang hồ sơ thiết bị giả lập, chạy qua thư viện `html5-qrcode` thật trên cả ba cấu hình trình duyệt.

Nhật ký: `tmp/qr-tests-final.log`, `tmp/qr-lint-final.log`, `tmp/qr-build-final.log`, `tmp/qr-final-e2e.log`, `tmp/qr-regression.log`. Đợt hồi quy kết hợp có một lỗi focus QR trên WebKit; lỗi đã sửa và bộ QR 18 ca sau đó đạt toàn bộ. Không trình bày đợt hồi quy cũ là 69/69 đạt.

Ảnh giao diện dùng dữ liệu giả: `tmp/qr-repair-*.png`, `tmp/qr-inventory-*.png`, `tmp/qr-transfer-*.png`, `tmp/qr-camera-*.png`. Ảnh camera dùng nguồn giả lập nên nền không có hình camera vật lý.

## Giới hạn và bước trước phát hành

- Chưa thử camera vật lý Android/iPhone, đèn pin hoặc chuyển ống kính thật. Kiểm thử vòng đời camera dùng bộ giả lập có callback được kiểm soát; không thay thế kiểm tra thiết bị thật.
- Thư viện đọc một mã mỗi lần; ảnh chứa nhiều mã có thể trả một mã. Thẻ xác nhận luôn cho người dùng kiểm tra thiết bị trước khi dùng.
- Chưa deploy. Cần thử nhanh trên điện thoại thực tế với tem đang sử dụng trước khi phát hành hệ thống thật.

Báo cáo Antigravity là bản bàn giao ban đầu. Kết luận và giới hạn trong tài liệu Codex này phản ánh bản đã sửa sau review.

Lưu ý workspace: cuối quá trình kiểm tra xuất hiện thêm thay đổi ngoài đầu việc QR ở `gas/Code.gs`, `src/App.tsx`, `src/services/api.ts`, Sidebar, TopNav và trang AdminSettings. Codex giữ nguyên và không nghiệm thu các thay đổi quản trị này. Kết quả lint/build ở trên thuộc lần kiểm tra trước khi phát hiện các thay đổi đồng thời đó, không chứng nhận toàn bộ workspace mới nhất. Trước deploy cần kiểm tra lại bản tổng hợp sau khi bên chỉnh sửa quản trị bàn giao.
