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

| ID | Category | Description |
|----|------|-------|
| FR1 | Access Control | Allows university members to enter the parking lot using their official identification cards |
| FR2 | Authentication | Authenticates via HCMUT_SSO; synchronizes information from HCMUT_DATACORE (read-only) |
| FR3 | Visitor | Issues temporary tickets for casual visitors or individuals without cards |
| FR4 | Monitoring | Detects the occupied/vacant status of each parking slot via IoT sensors |
| FR5 | Monitoring | Calculates the number of available slots across the entire parking lot in real time |
| FR6 | Guidance | Displays the parking lot status (Available / Near Full / Full) on LED boards |
| FR7 | Guidance | Provides directional guidance to alternative parking areas |
| FR8 | Billing | Calculates parking fees for students based on periodic billing cycles |
| FR9 | Payment | Initiates payment requests via the BKPay platform |
| FR10 | Billing | Calculates parking fees for casual visitors |
| FR11 | Administration | Allows administrators to configure pricing policies and parking privileges |
| FR12 | Logging | Logs all parking activities and financial transactions |

---

## 📏 Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | The system responds to entry/exit requests within ≤ 2 seconds |
| **Availability** | Uptime ≥ 99% during operational hours |
| **Reliability** | Continues to operate even if a single sensor fails |
| **Security** | Role-Based Access Control (RBAC) for all administrative functions |
| **Scalability** | Supports at least 5,000 concurrent users |
| **Data Integrity** | All transactions are logged and cannot be altered without authorization |
| **Fault Tolerance** | Tolerates faults when the IoT gateway loses connection or sensor data is delayed |

---

## 👤 Actors & Stakeholders

| Actor | Description |
|---|---|
| **University Member** | Students, graduate students, PhD candidates, lecturers, staff — use ID cards for entry/exit |
| **Visitor** | Casual visitors, use temporary tickets |
| **Parking Operator** | Gate operations staff, handles exceptional cases |
| **System Administrator** | Configures pricing, manages user roles, views reports and logs |
| **HCMUT_SSO** | University central authentication system |
| **HCMUT_DATACORE** | University user database (read-only) |
| **BKPay** | HCMUT internal payment platform |
| **IoT Gateway** | Sensor data collection gateway from parking slots |

---

## 🗂️ Use Cases

### Nhóm chính

| Use Case | Actor | Description |
|---|---|---|
| Enter Parking Area | Member / Visitor / Operator | Enter the parking area via ID card or temporary ticket |
| Exit Parking Area | Member / Visitor / Operator | Exit the parking area, ending the parking session |
| Monitor Parking Availability | Operator / IoT Gateway | View real-time parking slot status |
| Display Parking Guidance | Member / Visitor | View guidance and available slots on LED boards |
| Pay Parking Fee | Member / BKPay | Pay parking fees via BKPay |
| Configure Pricing Policy | Admin | Configure fee calculation rules |
| Manage User Roles | Admin / HCMUT_DATACORE | Manage user permissions and roles |
| View Logs and Reports | Admin / Operator | View activity history and generated reports |
| Handle Lost Card | Operator | Handle exceptional cases involving lost cards |

---

## 📁 Repository Structure

```
Web-parking-system/
├── index.html             
├── src/
│   ├── pages/              
│   ├── components/        
│   ├── assets/            
│   └── data/            
├── docs/
│   ├── diagrams/           
│   └── report/           
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

cd Web-parking-system

```

---

## 📄 Submissions

| # | Content | Status |
|---|---|---|
| Submission 1 | Functional/Non-functional Requirements + Use-case Diagram | ✅ Completed |
| Submission 2 | Sequence Diagrams + Activity Diagrams + UI Mockup | ✅ Completed |
| Submission 3 | Architecture + Class Diagram + Method Descriptions | ✅ Completed |
| Final | Compilation of all sections + Demo + AI Disclosure | ✅ Completed |

---

## 📜 License

This project is for academic purposes only — Software Engineering Course, HCMUT 2025–2026.
