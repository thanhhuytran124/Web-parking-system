# 🅿️ Smart Parking Management System (IoT-SPMS)

> **Software Engineering – CC03 | Academic Year 2025–2026**
> Ho Chi Minh City University of Technology (HCMUT) – Vietnam National University

---

## 👥 Team Members

| Họ và tên | MSSV |
|---|---|
| Nguyễn Trương Đức Tài | 2252723 |
| Trần Thanh Huy | 2352414 |
| Lê Bảo Khánh | 2352519 |
| Nguyễn Đình Khoa | 2352573 |

**Advisor:** MSc. Nguyễn Thành Công

---

## 📖 Project Overview

HCMUT accommodates thousands of daily parking activities from students, faculty, staff, and visitors. Current systems face challenges such as congestion at entry/exit points, inefficient space utilization, limited real-time visibility, and fragmented fee management.

The **IoT-based Smart Parking Management System (IoT-SPMS)** is proposed as an integrated solution that leverages IoT sensors and modern software engineering to provide:

- 🔐 Automatic access control via university ID cards
- 📡 Real-time monitoring of parking space availability
- 🗺️ Dynamic traffic guidance through electronic signage
- 💳 Integrated billing and payment via **BKPay**
- 🔗 Integration with **HCMUT_SSO** and **HCMUT_DATACORE**

---

## 🏗️ System Architecture

The system integrates several key components:

```
┌─────────────────────────────────────────────────────┐
│                 Web Application                      │
│        (User / Operator / Admin Interface)           │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Central Management System               │
│   - Access Control    - Session Management           │
│   - Billing Engine    - Reporting & Logging          │
└────┬──────────┬───────────────┬────────────┬────────┘
     │          │               │            │
 HCMUT_SSO  HCMUT_DATACORE   BKPay    IoT Gateway
                                            │
                                    Parking Sensors
                                    (per slot)
```

---

## ✅ Functional Requirements

| ID | Nhóm | Mô tả |
|----|------|-------|
| FR1 | Access Control | Cho phép thành viên trường vào bãi xe bằng thẻ định danh chính thức |
| FR2 | Authentication | Xác thực qua HCMUT_SSO; đồng bộ thông tin từ HCMUT_DATACORE (read-only) |
| FR3 | Visitor | Phát hành vé tạm thời cho khách vãng lai hoặc người không mang thẻ |
| FR4 | Monitoring | Phát hiện trạng thái có/trống của từng chỗ đậu qua cảm biến IoT |
| FR5 | Monitoring | Tính toán số chỗ trống toàn bãi theo thời gian thực |
| FR6 | Guidance | Hiển thị trạng thái bãi xe (còn chỗ / gần đầy / hết chỗ) trên bảng LED |
| FR7 | Guidance | Chỉ dẫn hướng đến khu đỗ xe thay thế |
| FR8 | Billing | Tính phí gửi xe cho sinh viên theo chu kỳ thanh toán định kỳ |
| FR9 | Payment | Khởi tạo yêu cầu thanh toán qua nền tảng BKPay |
| FR10 | Billing | Tính phí gửi xe cho khách vãng lai |
| FR11 | Administration | Cho phép admin cấu hình chính sách giá và quyền gửi xe |
| FR12 | Logging | Ghi nhật ký toàn bộ hoạt động gửi xe và giao dịch tài chính |

---

## 📏 Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Hệ thống phản hồi yêu cầu ra/vào trong vòng ≤ 2 giây |
| **Availability** | Uptime ≥ 99% trong giờ hoạt động |
| **Reliability** | Tiếp tục vận hành khi một cảm biến bị hỏng |
| **Security** | Phân quyền RBAC cho tất cả chức năng quản trị |
| **Scalability** | Hỗ trợ ít nhất 5.000 người dùng đồng thời |
| **Data Integrity** | Toàn bộ giao dịch được ghi log và không thể chỉnh sửa trái phép |
| **Fault Tolerance** | Chịu lỗi khi IoT gateway mất kết nối hoặc dữ liệu cảm biến bị trễ |

---

## 👤 Actors & Stakeholders

| Actor | Mô tả |
|---|---|
| **University Member** | Sinh viên, học viên cao học, NCS, giảng viên, cán bộ — dùng thẻ ID để ra/vào |
| **Visitor** | Khách vãng lai, dùng vé tạm thời |
| **Parking Operator** | Nhân viên vận hành cổng bãi xe, xử lý các trường hợp ngoại lệ |
| **System Administrator** | Cấu hình giá, quản lý vai trò, xem báo cáo và log |
| **HCMUT_SSO** | Hệ thống xác thực của trường |
| **HCMUT_DATACORE** | Cơ sở dữ liệu người dùng trường (read-only) |
| **BKPay** | Nền tảng thanh toán nội bộ của HCMUT |
| **IoT Gateway** | Cổng thu thập dữ liệu cảm biến từ các chỗ đậu |

---

## 🗂️ Use Cases

### Nhóm chính

| Use Case | Actor | Mô tả |
|---|---|---|
| Enter Parking Area | Member / Visitor / Operator | Vào bãi xe qua thẻ ID hoặc vé tạm |
| Exit Parking Area | Member / Visitor / Operator | Ra bãi xe, kết thúc phiên gửi xe |
| Monitor Parking Availability | Operator / IoT Gateway | Xem trạng thái chỗ đậu real-time |
| Display Parking Guidance | Member / Visitor | Xem hướng dẫn và chỗ trống trên bảng LED |
| Pay Parking Fee | Member / BKPay | Thanh toán phí qua BKPay |
| Configure Pricing Policy | Admin | Cấu hình quy tắc tính phí |
| Manage User Roles | Admin / HCMUT_DATACORE | Phân quyền người dùng |
| View Logs and Reports | Admin / Operator | Xem lịch sử hoạt động và báo cáo |
| Handle Lost Card | Operator | Xử lý trường hợp mất thẻ |

---

## 📁 Repository Structure

```
Web-parking-system/
├── index.html              # Trang chủ / Entry point
├── src/
│   ├── pages/              # Các trang giao diện
│   ├── components/         # Các component UI tái sử dụng
│   ├── assets/             # Hình ảnh, icons
│   └── data/               # Dữ liệu hard-coded (mock data)
├── docs/
│   ├── diagrams/           # Sơ đồ use case, sequence, class...
│   └── report/             # Báo cáo các submission
└── README.md
```

---

## 🚀 Getting Started

### Yêu cầu
- Trình duyệt web hiện đại (Chrome, Firefox, Edge)
- Không yêu cầu backend hoặc database — dữ liệu được hard-code

### Chạy project

```bash
# Clone repo
git clone https://github.com/thanhhuytran124/Web-parking-system.git

# Vào thư mục
cd Web-parking-system

# Mở file index.html bằng trình duyệt
# Hoặc dùng Live Server nếu dùng VS Code
```

---

## 📄 Submissions

| # | Nội dung | Trạng thái |
|---|---|---|
| Submission 1 | Functional/Non-functional Requirements + Use-case Diagram | ✅ Completed |
| Submission 2 | Sequence Diagrams + Activity Diagrams + UI Mockup | ✅ Completed |
| Submission 3 | Architecture + Class Diagram + Method Descriptions | ✅ Completed |
| Final | Tổng hợp tất cả + Demo + AI Disclosure | 🔄 In Progress |

---

## 🤖 Generative AI Usage Disclosure

Trong quá trình thực hiện bài tập lớn, nhóm có sử dụng các công cụ AI hỗ trợ như:

- **Claude (Anthropic)** — Hỗ trợ tìm ý tưởng, gợi ý cấu trúc tài liệu, review diagram
- **ChatGPT (OpenAI)** — Hỗ trợ tra cứu thuật ngữ, kiểm tra nội dung tiếng Anh

Toàn bộ nội dung đã được nhóm đọc hiểu, phân tích và chỉnh sửa để phù hợp với yêu cầu bài. Nhóm chịu trách nhiệm hoàn toàn về nội dung đã nộp.

---

## 📜 License

This project is for academic purposes only — Software Engineering Course, HCMUT 2025–2026.