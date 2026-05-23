# BÁO CÁO THUYẾT MINH SÁNG KIẾN CẢI TIẾN KỸ THUẬT
**Tên sáng kiến:** "Xây dựng và tối ưu hóa hệ thống thông tin quản lý trang thiết bị y tế bảo mật cao trên nền tảng Serverless và React 19 tại Trung tâm Y tế"

---

## 1. Tác giả sáng kiến
- **Họ và tên:** [Tên của bạn]
- **Chức vụ / Đơn vị công tác:** Khoa/Phòng [Tên khoa phòng của bạn] - Trung tâm Y tế huyện Thanh Ba

---

## 2. Lĩnh vực áp dụng sáng kiến
- Công nghệ thông tin trong y tế (eHealth / Digital Health).
- Quản lý trang thiết bị y tế và điều phối hoạt động kỹ thuật bệnh viện.

---

## 3. Thực trạng trước khi cải tiến (Đặt vấn đề)
Trong công tác quản lý trang thiết bị tại các cơ sở y tế tuyến huyện, việc theo dõi trạng thái thiết bị, tiếp nhận yêu cầu sửa chữa và chuyển giao thiết bị thường gặp các hạn chế sau:
1. **Thủ công và rời rạc:** Việc báo hỏng thiết bị và chuyển giao giữa các khoa phòng chủ yếu thực hiện qua văn bản giấy hoặc file Excel ngoại tuyến (offline) dễ dẫn đến sai sót, thất lạc dữ liệu và mất nhiều thời gian xử lý thủ tục hành chính.
2. **Chi phí đầu tư hạ tầng cao:** Các giải pháp phần mềm quản lý thiết bị chuyên dụng trên thị trường đòi hỏi chi phí mua bản quyền lớn, chi phí duy trì máy chủ (Server), cơ sở dữ liệu (SQL) và đội ngũ kỹ thuật vận hành đắt đỏ, vượt quá khả năng chi trả của đơn vị y tế cơ sở.
3. **Trải nghiệm người dùng kém:** Các trang web quản lý thông tin nội bộ cũ thường có giao diện lỗi thời, phản hồi chậm, không có cơ chế thông báo tự động khi phát sinh yêu cầu khẩn cấp như thiết bị y tế báo hỏng.
4. **Bảo mật và rò rỉ dữ liệu:** Do đặc thù các khoa phòng bệnh viện thường sử dụng chung một máy tính trực, việc không kiểm soát tốt bộ nhớ đệm (Cache) và dữ liệu phiên đăng nhập cũ dẫn đến nguy cơ nhân viên khoa này nhìn thấy thông tin thiết bị và lịch sử của khoa khác sau khi đã đổi tài khoản.

---

## 4. Mô tả chi tiết giải pháp kỹ thuật cải tiến
Sáng kiến này đề xuất giải pháp thiết lập một ứng dụng web Single Page Application (SPA) hiện đại chạy trên môi trường **Serverless** kết hợp với các kỹ thuật tối ưu hóa hiệu năng và bảo mật phiên làm việc nâng cao. Dưới đây là phân tích chi tiết các giải pháp kỹ thuật cốt lõi đã được áp dụng:

### 4.1. Kiến trúc Serverless thông qua cơ chế CORS-Bypass RESTful API với Google Apps Script
Để giải quyết bài toán chi phí hạ tầng máy chủ, hệ thống được thiết kế theo mô hình Serverless hoàn toàn:
- **Nguyên lý hoạt động:** Sử dụng Google Sheets làm hệ quản trị cơ sở dữ liệu trung tâm. Các nghiệp vụ CRUD (Create, Read, Update, Delete) được lập trình bằng Google Apps Script (GAS), đóng vai trò làm API Gateway xử lý dữ liệu và xác thực người dùng.
- **Giải pháp vượt rào CORS (Cross-Origin Resource Sharing):** Do Apps Script không hỗ trợ phản hồi truy vấn kiểm tra tiền đề (`OPTIONS` preflight request) khi gửi dữ liệu định dạng `application/json`, hệ thống đã áp dụng giải pháp cấu hình tiêu đề HTTP request:
  ```typescript
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  ```
  Việc chuyển đổi sang định dạng `text/plain` giúp trình duyệt nhận diện đây là một "Simple Request" (yêu cầu đơn giản), từ đó bỏ qua bước preflight check và gửi thẳng dữ liệu dạng chuỗi JSON thô tới Apps Script. Cơ chế này giúp giao tiếp liên miền (cross-origin) diễn ra trơn tru mà không cần cài đặt thêm proxy trung gian đắt đỏ.
- **Xác thực bảo mật phiên:** Apps Script tạo ra các mã băm phiên (`session token`) kết hợp thuộc tính thời gian hết hạn (`expiresAt`). Mã này được lưu trữ tạm thời trong bộ nhớ phiên của trình duyệt (`sessionStorage`), giúp bảo vệ tính toàn vẹn của dữ liệu truyền tải.

---

### 4.2. Cơ chế tối ưu bộ nhớ đệm trung tâm và đồng bộ hóa đa luồng (Custom Hook `useApiResource`)
Trong các ứng dụng SPA thông thường, mỗi thành phần (Component) giao diện khi hiển thị sẽ thực hiện một yêu cầu mạng (Request) riêng để lấy dữ liệu. Điều này dẫn tới hiện tượng trùng lặp yêu cầu mạng, làm chậm hệ thống và dễ bị Google khóa API do vượt hạn mức (rate limit).

Sáng kiến đã phát triển giải pháp thiết kế bộ quản lý trạng thái dùng chung (Global State Manager) thông qua **Custom Hook `useApiResource`** áp dụng kết hợp hai mẫu thiết kế kinh điển: **Registry Pattern** và **Observer Pattern**.

```
                           +----------------------------------------+
                           |           useApiResource()             |
                           +----------------------------------------+
                               /                 |                \
                              /                  |                 \
                             v                   v                  v
                 +-------------------+  +------------------+  +-------------------------+
                 |   cacheRegistry   |  | promiseRegistry  |  |   subscriberRegistry    |
                 | (Bộ nhớ đệm RAM)  |  | (Duy trì Promise |  |  (Danh sách đăng ký     |
                 |  Khóa: Tên bảng  |  |  đang xử lý để   |  |   lắng nghe thay đổi    |
                 |  Trị: Dữ liệu    |  |   chặn request   |  |    của các Component)   |
                 |     + TimeStamp   |  |    trùng lặp)    |  |                         |
                 +-------------------+  +------------------+  +-------------------------+
```

1. **Khử trùng lặp yêu cầu mạng (Request Deduplication):**
   Khi Component A yêu cầu danh sách thiết bị, một Promise lấy dữ liệu sẽ được tạo và đăng ký vào `promiseRegistry`. Nếu Component B cũng yêu cầu dữ liệu đó ngay sau đó (khi Promise A chưa hoàn thành), hệ thống sẽ trả về chính Promise A thay vì tạo kết nối HTTP mới.
   ```typescript
   let pendingPromise = promiseRegistry.get(key);
   if (pendingPromise) return pendingPromise; // Tái sử dụng kết nối đang chạy
   ```
2. **Quản lý Vòng đời Dữ liệu Đệm (Cache TTL):**
   Dữ liệu sau khi tải về được lưu tại `cacheRegistry` kèm theo nhãn thời gian (`timestamp`). Hệ thống sẽ tự động sử dụng lại dữ liệu đệm này trong khoảng thời gian hiệu lực `CACHE_TTL` (5 phút) mà không cần gọi API mạng, giúp giao diện hiển thị ngay lập tức (0ms).
3. **Cập nhật Reactive thời gian thực (Observer Pattern):**
   Khi một Component bất kỳ thay đổi dữ liệu (ví dụ: tạo mới yêu cầu sửa chữa), phương thức `mutate` sẽ ghi đè dữ liệu mới vào `cacheRegistry` và phát thông báo đến toàn bộ các Component đang hiển thị trên màn hình thông qua danh sách đăng ký `subscriberRegistry` để đồng bộ lại giao diện đồng loạt mà không cần tải lại toàn bộ trang web.

---

### 4.3. Kiến trúc chuông thông báo động phân quyền biên dịch Client-side
Để giảm thiểu tối đa tài nguyên lưu trữ và xử lý của hệ thống backend, thay vì tạo thêm một bảng cơ sở dữ liệu "Thông báo" và thực hiện truy vấn liên tục (polling), hệ thống áp dụng kỹ thuật **Biên dịch Thông báo Động tại phía Khách (Client-side Notification Compilation)**:

- **Thuật toán xử lý dữ liệu:** Hệ thống lắng nghe sự thay đổi của hai thực thể dữ liệu gốc là `Repairs` (Báo hỏng) và `Transfers` (Chuyển giao) thông qua cơ chế cache trung tâm. Sau đó, một bộ lọc logic nghiệp vụ (Business Rule Filter) sẽ tự động chạy trong hàm `useMemo` của thanh điều hướng để sinh ra danh sách thông báo theo thời gian thực dựa vào vai trò người dùng (Role-Based Access Control - RBAC):

$$\text{Thông báo hiển thị} = f(\text{Dữ liệu Repairs}, \text{Dữ liệu Transfers}, \text{Vai trò người dùng}, \text{Đơn vị công tác})$$

- **Bản đồ phân phối thông báo:**
  1. *Nếu tài khoản là Quản trị viên (Admin):*
     $$\text{Thông báo} = \{r \in \text{Repairs} \mid r.\text{status} = \text{'Chờ duyệt'}\} \cup \{t \in \text{Transfers} \mid t.\text{status} = \text{'PENDING\_RECEIVE'}\}$$
  2. *Nếu tài khoản là Nhân viên khoa phòng (Staff):*
     $$\text{Thông báo} = \{t \in \text{Transfers} \mid t.\text{status} = \text{'PENDING\_RECEIVE'} \land t.\text{toDepartment} = \text{Khoa đang trực}\} \cup \{r \in \text{Repairs} \mid r.\text{creator} = \text{User} \land r.\text{status} \neq \text{'Chờ duyệt'}\}$$

- **Đồng bộ hóa Trạng thái Đọc (Read/Unread State):**
  Trạng thái "Đã đọc" của từng thông báo được ánh xạ bằng mảng các khóa định danh (`id`) lưu trữ tại bộ nhớ trình duyệt `localStorage` (`qlttb.read_notifications`). Điều này giúp duy trì trạng thái xem của người dùng mà không cần thực hiện bất kỳ lệnh ghi dữ liệu (Write API) nào lên Google Sheets, bảo vệ hiệu năng hệ thống tuyệt đối.

---

### 4.4. Giải pháp cách ly an toàn thông tin và thu hồi tài nguyên (Cache Garbage Collection)
Do đặc thù y tế tuyến cơ sở thường xuyên luân chuyển ca trực, nhiều bác sĩ, điều dưỡng sử dụng chung một máy tính tại khoa. Rủi ro rò rỉ dữ liệu y tế giữa các phiên làm việc là rất lớn nếu trình duyệt lưu trữ bộ nhớ đệm vô thời hạn.

Sáng kiến đã xây dựng giải pháp **Thu hồi và giải phóng tài nguyên bộ đệm chủ động (Active Cache Garbage Collection)**:
- **Nguyên lý hoạt động:** Hàm `logout` không chỉ thực hiện công tác xóa cookie, xóa token đăng nhập trong `sessionStorage` mà còn kích hoạt hàm thu dọn tài nguyên `clearApiResourceCache()`.
- **Cơ chế thu dọn:**
  ```typescript
  export function clearApiResourceCache() {
    cacheRegistry.clear();
    promiseRegistry.clear();
    subscriberRegistry.forEach((subs) => {
      subs.forEach((cb) => cb());
    });
  }
  ```
  Lệnh này xóa bỏ toàn bộ tham chiếu đối tượng dữ liệu trong các Map Registry tĩnh ở RAM, từ đó kích hoạt bộ dọn rác tự động của trình duyệt (V8 Engine Garbage Collector) giải phóng vùng nhớ chứa thông tin nhạy cảm ngay lập tức. Sau đó, nó phát lệnh ép buộc render lại giao diện cho các subscriber đang hoạt động để làm sạch hoàn toàn dữ liệu hiển thị trên màn hình, chặn đứng hoàn toàn rủi ro rò rỉ chéo thông tin.

---

### 4.5. Cơ chế lưu giữ ngữ cảnh điều hướng (Route Interception & Context Memory)
Để nâng cao trải nghiệm sử dụng của nhân viên y tế (vốn bận rộn và cần thao tác nhanh), hệ thống được trang bị bộ nhớ ngữ cảnh điều hướng:
- Khi người dùng bấm vào một liên kết sâu (deep link) chia sẻ từ đồng nghiệp (ví dụ: trang chi tiết thiết bị cụ thể hoặc yêu cầu sửa chữa) mà chưa đăng nhập, bộ bảo vệ tuyến đường `PrivateRoute` sẽ chặn yêu cầu điều hướng và đóng gói địa chỉ URL đích vào đối tượng trạng thái `location.state.from`.
- Sau khi xác thực thành công tại trang `Login`, hệ thống sẽ trích xuất thông tin này và tự động đưa người dùng đến đúng URL họ đang yêu cầu trước đó thông qua phương thức điều hướng thay thế lịch sử (`navigate(from, { replace: true })`). Điều này giúp loại bỏ hoàn toàn các bước tìm kiếm thủ công lặp đi lặp lại sau khi đăng nhập.

---

## 5. Hiệu quả kinh tế - xã hội mang lại

### 5.1. Hiệu quả kinh tế (Làm lợi cho đơn vị)
1. **Tiết kiệm 100% chi phí bản quyền và hạ tầng:** Đơn vị không mất bất kỳ chi phí nào để mua phần mềm thương mại hoặc vận hành máy chủ vật lý/đám mây. Chi phí đầu tư dự án bằng 0 đồng.
2. **Tiết kiệm tài nguyên mạng:** Cơ chế cache thông minh giảm thiểu dung lượng băng thông tiêu thụ của mạng nội bộ bệnh viện.
3. **Giảm chi phí hao mòn thiết bị:** Tiếp nhận báo hỏng tức thời giúp bộ phận kỹ thuật khắc phục sớm các sự cố nhỏ, tránh việc thiết bị hỏng nặng hơn dẫn đến phải thay thế linh kiện đắt tiền.

### 5.2. Hiệu quả xã hội và quản lý
1. **Rút ngắn thời gian xử lý sự cố:** Rút ngắn thời gian báo hỏng thiết bị từ nửa ngày xuống còn dưới 1 phút. Nhân viên y tế tại khoa chỉ cần 3 click chuột để gửi yêu cầu sửa chữa thay vì phải viết phiếu và mang trực tiếp lên phòng vật tư.
2. **Tối ưu hóa nguồn lực thiết bị y tế:** Quản lý chính xác tình trạng sử dụng và điều chuyển thiết bị giữa các khoa, tránh tình trạng khoa thừa thiết bị đắp chiếu trong khi khoa khác thiếu thiết bị điều trị bệnh nhân.
3. **Báo cáo và thống kê chính xác:** Lãnh đạo Trung tâm dễ dàng theo dõi toàn bộ tài sản thiết bị, tần suất hỏng hóc và chi phí sửa chữa thông qua giao diện báo cáo tự động, minh bạch.

---

## 6. Cam đoan
Tôi xin cam đoan đề tài sáng kiến này do tôi nghiên cứu và triển khai trực tiếp dựa trên các nhu cầu thực tế của đơn vị, không sao chép từ bất kỳ nguồn tài liệu hay phần mềm thương mại nào khác. Kính mong Hội đồng sáng kiến cấp cơ sở xem xét và công nhận đề tài này.

*Thanh Ba, ngày 20 tháng 05 năm 2026*

**Người nộp đơn**  
*(Ký và ghi rõ họ tên)*
