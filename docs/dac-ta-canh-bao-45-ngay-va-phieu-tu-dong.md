# Quy tắc 45 ngày và phiếu tự động DOCX/PDF

Chốt yêu cầu ngày 27/09/2026 theo quyết định của người dùng. Tài liệu này thay thế các phương án còn mở về ngưỡng cảnh báo và định dạng phiếu trong báo cáo rà soát trước. Phần sinh phiếu dưới đây là đặc tả triển khai, chưa phải chức năng đã nghiệm thu.

## 1. Cảnh báo thống nhất

- Mọi loại hồ sơ áp dụng cùng ngưỡng 45 ngày, bao gồm ngày thứ 45. Không lấy ngưỡng 30 hoặc 90 ngày từ dữ liệu cũ.
- Còn trên 45 ngày: chưa đến đợt cảnh báo. Còn 0–45 ngày: cảnh báo sắp hết hạn; ngày 0 vẫn là ngày cuối hiệu lực. Qua ngày đó: quá hạn. Thiếu ngày: cần bổ sung dữ liệu.
- Đã gửi/đã phê duyệt là tiến độ hồ sơ, không làm mất cảnh báo ngày hết hạn.
- Khi nhận chứng nhận mới: Chi tiết thiết bị → Tài liệu kiểm định → Gia hạn đăng kiểm; nhập số chứng nhận, ngày cấp và ngày hết hiệu lực mới, đính kèm chứng nhận. Giữ hồ sơ cũ trong lịch sử. Cảnh báo kỳ tiếp theo dựa trên hạn mới.
- Đồng bộ Tổng quan, thiết bị, Điều hành, báo cáo và email. Ngày tính theo múi giờ đơn vị. Email hằng ngày giữ cơ chế hiện hành; thay ngưỡng không có nghĩa là đã thay cơ chế chống trùng/gửi mail.

## 2. Người dùng lập phiếu

1. Người dùng lập yêu cầu sửa chữa hoặc luân chuyển trong luồng hiện có. Không nhập lại thông tin thiết bị và tài khoản trong Word.
2. Máy chủ kiểm tra quyền, lấy thông tin thiết bị từ dữ liệu quản lý và người lập/khoa phòng từ tài khoản xác thực. Không tin tên người lập, chủ sở hữu do trình duyệt tự gửi.
3. Lưu yêu cầu nghiệp vụ cùng bản chụp dữ liệu dùng để in và ID phiên bản mẫu. Trả kết quả lưu yêu cầu ngay; việc chuyển đổi tệp chạy nền.
4. Hiển thị trạng thái riêng: Chờ tạo phiếu → Đang tạo → Sẵn sàng, hoặc Cần xử lý nếu lỗi. Không báo gửi yêu cầu thất bại chỉ vì xuất PDF thất bại.
5. Tại chi tiết yêu cầu và Mẫu và phiếu, hiển thị hai nút **Tải DOCX**, **Tải PDF** khi cả hai tệp đã sẵn sàng. Người dùng không phải tải tệp hoàn thành lên lại.
6. Tệp tự lưu vào kho Google Drive riêng tư của hệ thống. Người dùng tải qua API có kiểm tra quyền; không phát hành liên kết công khai.

Mua sắm: hiện ứng dụng mới có danh mục mẫu, chưa có luồng yêu cầu mua sắm. Cần thêm form Đề nghị mua sắm với tên/loại thiết bị, số lượng, đơn vị tính, lý do và yêu cầu kỹ thuật; dự toán/nguồn kinh phí là trường tùy chọn. Người lập và khoa phòng tự điền. Không bắt buộc mã thiết bị vì thiết bị chưa được mua. Phạm vi này tạo đề nghị và phiếu; quy trình đấu thầu, phê duyệt mua và nhập tài sản là công việc riêng.

## 3. Admin quản lý mẫu

1. Mỗi loại sửa chữa/luân chuyển/mua sắm có một phiên bản DOCX được chọn để tự động lập phiếu. Các mẫu PDF/XLSX cũ vẫn dùng thủ công, không tự suy đoán vị trí điền.
2. Admin tải DOCX lên, hệ thống kiểm tra định dạng, kích thước, trường đánh dấu và các trường bắt buộc của loại phiếu.
3. Tạo bản xem trước DOCX/PDF bằng dữ liệu thử có dấu tiếng Việt, tên dài và mô tả nhiều dòng. Admin kiểm tra bố cục trước khi kích hoạt mẫu.
4. Thay mẫu tạo phiên bản mới. Phiếu đã lập giữ nguyên mẫu, dữ liệu và tệp cũ. Ngừng mẫu chỉ ngăn yêu cầu mới dùng mẫu đó.
5. Thiếu mẫu hoặc mẫu lỗi: vẫn lưu yêu cầu nghiệp vụ, hiển thị Cần cấu hình mẫu. Sau khi admin chọn mẫu hợp lệ, cho phép tạo lại phiếu từ dữ liệu yêu cầu đã lưu và ghi nhận phiên bản được chọn khi khôi phục.

## 4. Hợp đồng trường DOCX

Viết nguyên trường trong cùng một đoạn văn bản; không ngắt trường sang các ô hoặc textbox. Các tên dưới đây là hợp đồng đề xuất cho bộ ghép mẫu, chưa phải API hiện có.

| Trường | Nội dung/nguồn |
|---|---|
| `{{request.code}}` | Mã yêu cầu ổn định do hệ thống cấp |
| `{{request.date}}` | Ngày lập theo múi giờ đơn vị |
| `{{request.description}}` | Mô tả/lý do trong yêu cầu đã lưu |
| `{{requester.name}}` | Họ tên tài khoản xác thực |
| `{{requester.username}}` | Tên tài khoản lập phiếu |
| `{{department.name}}` | Khoa/phòng người lập tại lúc gửi |
| `{{device.id}}` | Mã thiết bị, nếu đã xác định |
| `{{device.name}}` | Tên thiết bị hoặc tên loại đề nghị |
| `{{device.model}}` | Model trong hồ sơ thiết bị |
| `{{device.serial}}` | Số serial trong hồ sơ thiết bị |
| `{{device.department}}` | Khoa đang giữ thiết bị lúc lập |
| `{{transfer.from}}`, `{{transfer.to}}` | Khoa giao, khoa nhận |
| `{{request.quantity}}`, `{{request.unit}}` | Số lượng, đơn vị tính |
| `{{purchase.specification}}` | Yêu cầu kỹ thuật mua sắm |
| `{{purchase.estimatedCost}}` | Dự toán nếu có |
| `{{purchase.fundingSource}}` | Nguồn kinh phí nếu có |

Trường bắt buộc chung: mã phiếu, ngày lập, người lập, khoa/phòng, tên thiết bị/loại thiết bị, mô tả đề nghị. Thiết bị chưa phân công hoặc mua mới không được tự gán serial/model của một thiết bị khác. Trường không áp dụng in dấu “—”; dữ liệu bắt buộc thiếu thì báo lỗi rõ.

Phiếu đề nghị không điền sẵn kết quả xử lý, người duyệt hoặc chữ ký. Không bổ sung chữ ký điện tử. DOCX người dùng tải về và chỉnh sửa không tự ghi ngược vào dữ liệu chính thức hoặc bản PDF đã lưu.

Mẫu A4 dùng bảng để căn cột, ảnh nội dòng, font hỗ trợ tiếng Việt; không căn bằng dấu cách. Cho phép mô tả xuống dòng và sang trang. Đầu bảng lặp ở trang sau, không giới hạn toàn bộ phiếu vào một trang. Lần đầu chỉ hỗ trợ một yêu cầu/phiếu; bảng kê nhiều thiết bị cần hợp đồng lặp riêng, không tự nối văn bản vào một ô.

## 5. Lưu trữ và xử lý nền

- Lưu ID yêu cầu, chủ sở hữu, loại phiếu, phiên bản mẫu, bản chụp dữ liệu, trạng thái xuất, số lần thử, lỗi gần nhất, thời điểm và ID hai tệp.
- Ghi bản chụp cùng bản ghi yêu cầu để tránh mất việc tạo phiếu khi trình duyệt đóng hoặc mạng ngắt. Worker đối soát các yêu cầu chưa có kết quả xuất; không tự sinh lại toàn bộ hồ sơ lịch sử.
- Khóa chống trùng theo ID yêu cầu + phiên bản phiếu; worker có thời hạn giữ việc và mã lần chạy. Không giữ khóa Sheets trong khi gọi Drive/chuyển đổi tài liệu.
- Chỉ công bố Sẵn sàng sau khi cả DOCX và PDF được lưu và kiểm tra. Nếu một tệp lỗi, giữ trạng thái lỗi/đang xử lý; thử lại cùng yêu cầu, không tạo thêm yêu cầu nghiệp vụ.
- Giới hạn số lần tự thử, thời gian xử lý và kích thước. Lỗi quyền Drive/mẫu lỗi phải có hướng dẫn cụ thể; không thử vô hạn. Không đưa token hoặc dữ liệu nhạy cảm vào thông báo lỗi.
- Admin xem tất cả; tài khoản thường chỉ liệt kê/tải/tạo lại phiếu của mình. Kiểm tra ở backend cho từng thao tác và cả hai định dạng. Khoa phòng không thay thế quyền sở hữu phiếu.
- Đề xuất chuyển DOCX sang Google Docs để thay trường, sau đó xuất DOCX/PDF bằng Drive. Cần xác minh chuyển đổi bằng mẫu thật của đơn vị; mẫu có textbox nổi, font đặc biệt hoặc bố cục phức tạp có thể bị thay đổi. Giữ tệp nguồn và phiên bản gốc để đối chiếu.

## 6. Trình tự triển khai và nghiệm thu

1. Đồng bộ ngưỡng 45 ngày và kiểm thử các ngày -1, 0, 44, 45, 46 với trạng thái chưa gửi/đã gửi/đã phê duyệt; thêm ca gia hạn và hồ sơ lưu trữ.
2. Xây kiểm tra mẫu, chọn phiên bản đang dùng và xem trước bằng dữ liệu thử. Chưa kích hoạt tự động khi mẫu chưa đạt.
3. Bổ sung bản chụp dữ liệu vào yêu cầu sửa chữa/luân chuyển, form đề nghị mua sắm và cơ chế chống trùng.
4. Xây worker chuyển đổi, hàng đợi bền vững, đối soát, khôi phục lỗi và lưu hai tệp riêng tư.
5. Thêm trạng thái tạo phiếu, nút tải hai định dạng và thao tác tạo lại có kiểm tra quyền.
6. Kiểm thử owner/admin, gửi lại sau timeout, worker chạy đồng thời, mất quyền Drive, thiếu mẫu, thay mẫu giữa lúc xử lý, một định dạng xuất lỗi, tên dài/tiếng Việt/nhiều trang và mở cả hai tệp thật.
7. Nghiệm thu trên môi trường thử với mẫu đơn vị; kiểm tra Apps Script/Drive/trigger và thời gian gửi yêu cầu trước/sau. Sau đó mới phát hành backend và frontend đồng bộ.

Trạng thái cập nhật 28/09/2026: mã cảnh báo 45 ngày, bộ sinh DOCX/PDF, hàng đợi, form đề nghị mua sắm và giao diện tải hai định dạng đã được triển khai cục bộ. Xem [bàn giao và hướng dẫn nghiệm thu](huong-dan-phieu-tu-dong-docx-pdf.md). Chưa deploy; chưa nghiệm thu chuyển đổi trên Google Drive thật.
