# PartPulse Orders System - User Guide for Procurement
# Ръководство за PartPulse Orders - За Снабдяване

**Version 2.7** | **Версия 2.7**  
**Last Updated:** February 24, 2026 | **Последна актуализация:** 24 февруари 2026  
**Prepared for:** Procurement and Admin Role Users | **Подготвено за:** Потребители в роля Снабдяване и Администратор

---

## Table of Contents | Съдържание

### English Version
1. Introduction
2. Getting Started
3. Dashboard Overview
4. Managing Orders
5. Creating and Managing Quotes
6. Updating Order Status
7. Advanced Features
8. Reporting and Analytics
9. Tips and Best Practices
10. Troubleshooting

### Българска Версия
1. Въведение
2. Начало на работа
3. Преглед на таблото
4. Управление на поръчки
5. Създаване и управление на оферти
6. Актуализиране на статус на поръчки
7. Разширени функции
8. Отчети и анализи
9. Съвети и добри практики
10. Отстраняване на проблеми

---

# ENGLISH VERSION

## 1. Introduction

Welcome to the **PartPulse Orders System Procurement Guide**! This comprehensive manual will help you manage the complete order lifecycle from request to delivery.

### What is PartPulse Orders?

PartPulse Orders is a web-based procurement management system designed for industrial environments. It streamlines the entire ordering process from requisition to delivery.

### Your Role as Procurement

As a Procurement user, you have full access to:

\begin{itemize}
\item View all orders from all requesters across the organization
\item Update order status throughout the fulfillment lifecycle
\item Create and manage supplier quotes
\item Track delivery timelines and priorities
\item Manage the complete order workflow
\item Access comprehensive order history and analytics
\end{itemize}

### Key Responsibilities

Your primary responsibilities include:

\begin{enumerate}
\item **Order Review** - Evaluate incoming order requests for feasibility
\item **Supplier Management** - Obtain quotes and place orders with suppliers
\item **Status Updates** - Keep requesters informed of order progress
\item **Timeline Management** - Ensure orders are delivered on time
\item **Documentation** - Maintain accurate records of quotes and transactions
\item **Communication** - Coordinate between requesters and suppliers
\end{enumerate}

---

## 2. Getting Started

### Accessing the System

**[SCREENSHOT PLACEHOLDER 1: Login screen with procurement credentials]**

\begin{enumerate}
\item Open your web browser (Chrome, Firefox, or Edge recommended)
\item Navigate to the PartPulse Orders URL
\item Enter your procurement username and password
\item Click "Login" to access the procurement dashboard
\end{enumerate}

### First Login Setup

After your first login:

\begin{itemize}
\item Verify your profile information
\item Review system notifications
\item Familiarize yourself with the interface layout
\item Check for any pending orders requiring immediate attention
\end{itemize}

### Dashboard Navigation

**[SCREENSHOT PLACEHOLDER 2: Procurement dashboard with labeled sections]**

The procurement dashboard is divided into several key areas:

\begin{table}
\begin{tabular}{|l|p{9cm}|}
\hline
\textbf{Section} & \textbf{Purpose} \\
\hline
Header Bar & Navigation menu, notifications, and profile access \\
\hline
View Toggle & Switch between Flat View and Grouped View \\
\hline
Quote Creation Bar & Quick access to create supplier quotes \\
\hline
Active Orders Table & All current orders requiring attention \\
\hline
Old Delivered Orders & Historical delivered orders (collapsible) \\
\hline
\end{tabular}
\caption{Dashboard Sections Overview}
\end{table}

---

## 3. Dashboard Overview

### Understanding the Procurement Interface

**[SCREENSHOT PLACEHOLDER 3: Full procurement dashboard labeled]**

Unlike the requester view, the procurement interface provides additional tools and controls:

### Quote Creation Bar

**[SCREENSHOT PLACEHOLDER 4: Quote creation bar highlighted]**

Located at the top of the orders section, this bar allows you to:

\begin{itemize}
\item Quickly create quotes for orders
\item Input supplier information
\item Enter pricing details
\item Add delivery time estimates
\end{itemize}

### View Modes

**Flat View:**
\begin{itemize}
\item Single comprehensive table
\item All orders visible at once
\item Sorted by priority (Urgent → High → Normal → Low)
\item Best for bulk processing
\end{itemize}

**[SCREENSHOT PLACEHOLDER 5: Flat view for procurement]**

**Grouped View:**
\begin{itemize}
\item Orders organized by status
\item Separate collapsible sections for each stage
\item Easier to focus on specific workflow stages
\item Better for stage-by-stage processing
\end{itemize}

**[SCREENSHOT PLACEHOLDER 6: Grouped view for procurement]**

### Orders Table Columns

**[SCREENSHOT PLACEHOLDER 7: Orders table with all columns visible]**

The procurement orders table includes all columns visible to requesters plus:

\begin{table}
\begin{tabular}{|l|p{8cm}|}
\hline
\textbf{Column} & \textbf{Description} \\
\hline
Order ID & Unique tracking identifier \\
\hline
Part Number & Manufacturer or internal part code \\
\hline
Description & Detailed item description \\
\hline
Quantity & Amount requested with unit \\
\hline
Status & Current order stage (editable) \\
\hline
Priority & Urgency level set by requester \\
\hline
Requester & Employee who submitted the order \\
\hline
Created & Date order was submitted \\
\hline
Date Needed & Requested delivery date \\
\hline
Delivery Status & Timeline indicator (On Time, Due Soon, Late) \\
\hline
Actions & View details, update status, create quote \\
\hline
\end{tabular}
\caption{Procurement Orders Table Columns}
\end{table}

### Priority Indicators

Orders are color-coded by priority:

\begin{table}
\begin{tabular}{|l|l|l|}
\hline
\textbf{Priority} & \textbf{Color} & \textbf{Action Required} \\
\hline
Urgent & Red & Immediate attention - same day \\
\hline
High & Orange & Process within 24 hours \\
\hline
Normal & Blue & Standard processing timeline \\
\hline
Low & Gray & Process when capacity allows \\
\hline
\end{tabular}
\caption{Priority Color Coding}
\end{table}

---

## 4. Managing Orders

### Order Lifecycle Overview

As a procurement specialist, you manage orders through six main stages:

\begin{enumerate}
\item **Pending** - New orders awaiting your initial review
\item **In Review** - Orders you're actively evaluating
\item **Quoted** - Orders with supplier quotes attached
\item **Ordered** - Orders placed with suppliers
\item **In Transit** - Orders shipped and in delivery
\item **Delivered** - Orders received by requester
\end{enumerate}

**[SCREENSHOT PLACEHOLDER 8: Order lifecycle diagram]**

### Reviewing New Orders

**[SCREENSHOT PLACEHOLDER 9: Pending orders section]**

When new orders arrive:

\begin{enumerate}
\item Check the **Pending** section (or Pending badge in Flat View)
\item Review order details:
  \begin{itemize}
  \item Part number and description
  \item Quantity and unit
  \item Date needed
  \item Priority level
  \item Requester notes
  \end{itemize}
\item Assess feasibility and supplier options
\item Update status to "In Review" when you begin processing
\end{enumerate}

### Viewing Order Details

**[SCREENSHOT PLACEHOLDER 10: Order details modal]**

\begin{enumerate}
\item Click the **eye icon** in the Actions column
\item The detailed view displays:
  \begin{itemize}
  \item Complete order information
  \item Full order history with timestamps
  \item All status changes and who made them
  \item Notes and comments
  \item Attached quotes
  \item Requester contact information
  \end{itemize}
\end{enumerate}

### Filtering and Searching

**By Priority:**
\begin{itemize}
\item Focus on Urgent orders first
\item Use priority color coding for quick identification
\end{itemize}

**By Status:**
\begin{itemize}
\item Use Grouped View to see orders by stage
\item Click section headers to expand/collapse
\end{itemize}

**By Requester:**
\begin{itemize}
\item Sort table by Requester column
\item Batch process orders from the same department
\end{itemize}

**By Date:**
\begin{itemize}
\item Sort by Date Needed to prioritize urgent deadlines
\item Check Delivery Status column for timeline alerts
\end{itemize}

### Pagination

**[SCREENSHOT PLACEHOLDER 11: Pagination controls]**

\begin{itemize}
\item Tables display 20 orders per page by default
\item Use Previous/Next buttons to navigate
\item Page numbers show total pages available
\item Consider using Grouped View for better organization of large order volumes
\end{itemize}

---

## 5. Creating and Managing Quotes

### When to Create a Quote

Create quotes when:

\begin{itemize}
\item You've received pricing from a supplier
\item Order has been evaluated and is ready for approval
\item Requester needs cost information for budgeting
\item You're comparing multiple supplier options
\end{itemize}

### Quote Creation Process

**[SCREENSHOT PLACEHOLDER 12: Quote creation bar with fields labeled]**

\begin{enumerate}
\item Locate the order in the Active Orders table
\item Use the Quote Creation Bar at the top of the screen
\item Fill in the required fields:
\end{enumerate}

\begin{table}
\begin{tabular}{|l|p{9cm}|}
\hline
\textbf{Field} & \textbf{What to Enter} \\
\hline
Select Order & Choose the order from the dropdown menu \\
\hline
Supplier Name & Enter the name of the supplier providing the quote \\
\hline
Total Price & Enter the quoted price (including currency) \\
\hline
Delivery Time & Estimated delivery timeline from supplier \\
\hline
Notes (Optional) & Additional information about the quote \\
\hline
\end{tabular}
\caption{Quote Creation Fields}
\end{table}

**[SCREENSHOT PLACEHOLDER 13: Completed quote creation form]**

### Submitting a Quote

\begin{enumerate}
\item Review all information for accuracy
\item Click **"Create Quote"** button
\item System automatically updates order status to "Quoted"
\item Quote information is saved to order history
\item Requester can now view the quote details
\end{enumerate}

**[SCREENSHOT PLACEHOLDER 14: Quote submission confirmation]**

### Quote Best Practices

\begin{itemize}
\item **Include all costs** - Total price should include shipping, taxes, etc.
\item **Be specific** - Note any special terms or conditions in the notes field
\item **Timeline accuracy** - Provide realistic delivery time estimates
\item **Multiple quotes** - Consider creating multiple quotes for comparison
\item **Documentation** - Keep supplier quote documents for reference
\end{itemize}

### Editing Quotes

**Note:** Once a quote is created, it becomes part of the order history. To modify:

\begin{enumerate}
\item Contact your system administrator
\item Or create a new quote with updated information
\item Add notes explaining the change
\end{enumerate}

### Quote Approval Process

After creating a quote:

\begin{enumerate}
\item Quote is visible to requester and management
\item Approval may be required depending on amount (per company policy)
\item Once approved, update order status to "Ordered"
\item Proceed with placing the order with the supplier
\end{enumerate}

---

## 6. Updating Order Status

### Status Update Workflow

**[SCREENSHOT PLACEHOLDER 15: Status update dropdown in actions column]**

Keeping order status current is critical for requester visibility and workflow management.

### How to Update Status

**Method 1: From Orders Table**
\begin{enumerate}
\item Locate the order in the table
\item Click on the current **Status badge**
\item Select the new status from the dropdown
\item Confirm the update
\end{enumerate}

**Method 2: From Order Details**
\begin{enumerate}
\item Click the eye icon to open order details
\item Find the Status Update section
\item Select new status from dropdown
\item Add notes if needed
\item Click "Update Status"
\end{enumerate}

**[SCREENSHOT PLACEHOLDER 16: Status update in order details view]**

### Status Progression Guide

\begin{table}
\begin{tabular}{|l|p{7cm}|l|}
\hline
\textbf{From Status} & \textbf{Next Status Options} & \textbf{When to Update} \\
\hline
Pending & In Review & When you begin processing \\
\hline
In Review & Quoted & After obtaining supplier quote \\
\hline
Quoted & Ordered & After placing order with supplier \\
\hline
Ordered & In Transit & When supplier confirms shipment \\
\hline
In Transit & Delivered & When requester receives item \\
\hline
\end{tabular}
\caption{Typical Status Progression}
\end{table}

### Status Change Notifications

When you update status:

\begin{itemize}
\item Change is logged in order history with timestamp
\item Your username is recorded as the person making the update
\item Requester sees the updated status immediately
\item System checks delivery timeline and updates "Delivery Status" indicator
\end{itemize}

### Special Status Updates

**Marking as Delivered:**

\begin{enumerate}
\item Confirm with requester that item was received
\item Update status to "Delivered"
\item System records delivery date
\item Order moves to "Old Delivered" section after 7 days
\end{enumerate}

**[SCREENSHOT PLACEHOLDER 17: Delivered order confirmation]**

**Handling Delays:**

If an order is delayed:

\begin{itemize}
\item Update status to reflect current stage accurately
\item Add detailed notes explaining the delay
\item Contact requester proactively about timeline changes
\item Update Date Needed if requester agrees to extension
\end{itemize}

### Bulk Status Updates

For processing multiple orders efficiently:

\begin{enumerate}
\item Use Grouped View to focus on specific status groups
\item Process all orders in "In Review" together
\item Move batch to "Quoted" after obtaining multiple quotes
\item Update to "Ordered" after placing multiple supplier orders
\end{enumerate}

---

## 7. Advanced Features

### Using Grouped View Effectively

**[SCREENSHOT PLACEHOLDER 18: Grouped view with all sections visible]**

Grouped View organizes orders into collapsible sections:

\begin{itemize}
\item **Pending Orders** - New requests awaiting initial review
\item **In Review** - Orders being actively processed
\item **Quoted** - Orders with supplier quotes attached
\item **Ordered** - Orders placed with suppliers
\item **In Transit** - Orders currently shipping
\item **Delivered (Recent)** - Orders delivered in last 7 days
\end{itemize}

**Benefits:**
\begin{itemize}
\item Focus on one workflow stage at a time
\item Reduce screen clutter
\item Better visualization of pipeline
\item Easier team coordination
\end{itemize}

**Tips:**
\begin{itemize}
\item Collapse sections you're not actively working on
\item Count badges show how many orders in each section
\item Click section headers to expand/collapse
\end{itemize}

### Delivery Timeline Management

**Understanding Delivery Status Indicators:**

**[SCREENSHOT PLACEHOLDER 19: Delivery status examples]**

\begin{table}
\begin{tabular}{|l|l|p{7cm}|}
\hline
\textbf{Indicator} & \textbf{Color} & \textbf{Meaning \& Action} \\
\hline
✓ On Time & Green & Delivery expected before date needed - no action required \\
\hline
⚠ Due Soon & Yellow & 2 days or less until date needed - prioritize order \\
\hline
⚠ Late & Red & Past date needed - expedite or communicate with requester \\
\hline
✓ Delivered & Green & Successfully delivered - no action required \\
\hline
\end{tabular}
\caption{Delivery Status Indicators}
\end{table}

**Proactive Timeline Management:**

\begin{enumerate}
\item Sort orders by Date Needed to see upcoming deadlines
\item Focus on "Due Soon" orders (yellow indicator)
\item Contact suppliers to expedite "Late" orders
\item Communicate realistic timelines to requesters
\end{enumerate}

### Old Delivered Orders Section

**[SCREENSHOT PLACEHOLDER 20: Old delivered orders section]**

Orders delivered more than 7 days ago move to this section:

\begin{itemize}
\item Section is collapsed by default to reduce clutter
\item Click to expand and view historical deliveries
\item Count badge shows total old delivered orders
\item Includes "Delivered" date column
\item Searchable for historical reference
\end{itemize}

**Use Cases:**
\begin{itemize}
\item Reference pricing for similar orders
\item Check delivery times from specific suppliers
\item Review requester order patterns
\item Verify order completion for reporting
\end{itemize}

### Working with Multiple Requesters

**Coordinator Responsibilities:**

\begin{itemize}
\item Monitor orders from all departments
\item Prioritize based on business impact, not just individual priority tags
\item Balance workload across multiple requesters
\item Identify patterns in recurring orders for optimization
\end{itemize}

**Communication Tips:**

\begin{itemize}
\item Use Order ID when communicating about specific orders
\item Proactively notify requesters of delays or issues
\item Set expectations on processing timelines
\item Document all communications in order notes
\end{itemize}

### System Notifications

Check for:
\begin{itemize}
\item New order submissions (Pending status)
\item Orders approaching Date Needed (Due Soon)
\item Orders past Date Needed (Late)
\item Orders requiring quote updates
\end{itemize}

---

## 8. Reporting and Analytics

### Order Volume Tracking

Monitor key metrics:

\begin{itemize}
\item Total orders by status
\item Orders by priority level
\item Orders by requester
\item Average processing time per stage
\item On-time delivery percentage
\end{itemize}

### Performance Indicators

**Efficiency Metrics:**

\begin{table}
\begin{tabular}{|l|p{8cm}|}
\hline
\textbf{Metric} & \textbf{Target / Best Practice} \\
\hline
Pending to In Review & Within 4 hours for Urgent, 24 hours for others \\
\hline
In Review to Quoted & 1-2 business days \\
\hline
Quoted to Ordered & Same day after approval \\
\hline
Ordered to In Transit & Depends on supplier (track average) \\
\hline
In Transit to Delivered & Depends on shipping method \\
\hline
On-Time Delivery Rate & Target 95\% or higher \\
\hline
\end{tabular}
\caption{Performance Targets}
\end{table}

### Supplier Performance

Track supplier metrics:

\begin{itemize}
\item Quote response time
\item Pricing competitiveness
\item Delivery reliability
\item Quality of delivered items
\item Communication responsiveness
\end{itemize}

### Using Historical Data

**[SCREENSHOT PLACEHOLDER 21: Historical orders analysis]**

Old Delivered Orders section provides valuable data:

\begin{itemize}
\item Review past orders for similar parts
\item Check historical pricing trends
\item Identify reliable suppliers for specific items
\item Analyze seasonal ordering patterns
\item Plan inventory based on recurring needs
\end{itemize}

---

## 9. Tips and Best Practices

### Daily Workflow Checklist

**Morning Routine:**

\begin{enumerate}
\item Log in and check for new Pending orders
\item Review orders with "Due Soon" status
\item Address any orders showing "Late" status
\item Check for supplier emails with quotes or shipment updates
\item Prioritize Urgent and High priority orders
\end{enumerate}

**Throughout the Day:**

\begin{enumerate}
\item Update status as you progress through workflow stages
\item Create quotes as soon as supplier information is received
\item Communicate proactively with requesters on delays
\item Document all important information in order notes
\end{enumerate}

**End of Day:**

\begin{enumerate}
\item Ensure all status updates are current
\item Follow up on pending supplier communications
\item Review tomorrow's approaching deadlines (Date Needed)
\item Update any orders moved to "In Transit" today
\end{enumerate}

### Effective Quote Management

\begin{itemize}
\item **Obtain multiple quotes** - Compare at least 2-3 suppliers when possible
\item **Full cost transparency** - Include all fees in Total Price
\item **Realistic timelines** - Verify delivery times with suppliers
\item **Document everything** - Use notes field for important details
\item **Quick turnaround** - Create quotes promptly after receiving supplier info
\end{itemize}

### Status Update Best Practices

\begin{itemize}
\item **Update frequently** - Keep status current throughout the day
\item **Be accurate** - Only update to next stage when actually reached
\item **Add context** - Use notes to explain delays or issues
\item **Immediate updates** - Update to "Delivered" as soon as confirmed
\item **Consistent progression** - Follow logical status flow
\end{itemize}

### Priority Management

**Handling Competing Priorities:**

\begin{table}
\begin{tabular}{|l|p{9cm}|}
\hline
\textbf{Scenario} & \textbf{Approach} \\
\hline
Multiple Urgent & Process by Date Needed (earliest first) \\
\hline
Urgent vs High volume & Address Urgent first, batch process High \\
\hline
Late orders & Prioritize even over new Urgent orders \\
\hline
Conflicting dates & Communicate with requesters to adjust expectations \\
\hline
\end{tabular}
\caption{Priority Conflict Resolution}
\end{table}

### Communication Strategies

**With Requesters:**

\begin{itemize}
\item Set clear expectations on processing timelines
\item Proactively communicate delays or issues
\item Provide delivery estimates when updating to "Ordered"
\item Confirm delivery with requester before marking as "Delivered"
\end{itemize}

**With Suppliers:**

\begin{itemize}
\item Establish preferred communication channels
\item Request tracking information for shipments
\item Build relationships for priority handling
\item Document all commitments and promises
\end{itemize}

**Internal Team:**

\begin{itemize}
\item Share supplier performance insights
\item Coordinate on large or complex orders
\item Standardize processes across team
\item Cross-train for coverage during absences
\end{itemize}

### Optimizing Workflow

**Batch Processing:**

\begin{itemize}
\item Group similar orders from same supplier
\item Process all quotes together during specific time blocks
\item Update multiple statuses after supplier communication
\item Review all Pending orders at scheduled intervals
\end{itemize}

**Using View Modes Strategically:**

\begin{itemize}
\item **Flat View** for quick scanning and bulk operations
\item **Grouped View** for focused stage-by-stage processing
\item Switch between views based on current task
\end{itemize}

**Reducing Response Time:**

\begin{itemize}
\item Pre-qualify suppliers for common parts
\item Maintain supplier contact information readily accessible
\item Use order notes as communication log
\item Set up email templates for common responses
\end{itemize}

---

## 10. Troubleshooting

### Common Issues and Solutions

**Problem: Quote creation fails or doesn't appear**

**[SCREENSHOT PLACEHOLDER 22: Quote creation error example]**

\begin{itemize}
\item **Solution 1:** Verify all required fields are completed
\item **Solution 2:** Check that order is selected from dropdown
\item **Solution 3:** Ensure Total Price contains only numbers and currency symbol
\item **Solution 4:** Refresh page and try again
\end{itemize}

**Problem: Status update doesn't save**

\begin{itemize}
\item **Solution 1:** Check internet connection
\item **Solution 2:** Verify you have procurement permissions
\item **Solution 3:** Refresh page and retry update
\item **Solution 4:** Contact administrator if issue persists
\end{itemize}

**Problem: Orders not appearing in correct status section**

\begin{itemize}
\item **Solution:** Refresh page (F5 or browser refresh button)
\item **Check:** Ensure you're viewing correct view mode (Flat vs Grouped)
\item **Verify:** Order status is what you expect in order details
\end{itemize}

**Problem: Cannot see all orders**

\begin{itemize}
\item **Solution 1:** Check pagination - navigate through multiple pages
\item **Solution 2:** Expand all sections in Grouped View
\item **Solution 3:** Verify you're logged in with procurement account
\item **Solution 4:** Check if filters are applied (if filtering is available)
\end{itemize}

**Problem: Delivery status showing "Late" for delivered order**

\begin{itemize}
\item **Solution:** This was fixed in version 2.7
\item **Action:** Refresh browser cache (Ctrl+F5)
\item **Verify:** Order status is set to "Delivered"
\end{itemize}

**Problem: Old delivered orders showing in active table**

\begin{itemize}
\item **Solution:** Fixed in version 2.7 - orders over 7 days old automatically move
\item **Action:** Refresh page to see correct organization
\item **Check:** Delivered date is correctly recorded
\end{itemize}

**Problem: View toggle buttons not working**

\begin{itemize}
\item **Solution:** Clear browser cache and refresh
\item **Check:** You're using a supported browser (Chrome, Firefox, Edge)
\item **Update:** Ensure system is running version 2.7 or higher
\end{itemize}

### Data Integrity Issues

**Problem: Order information appears incorrect**

\begin{enumerate}
\item Open order details view
\item Review order history for any unauthorized changes
\item Contact requester to verify information
\item Document any discrepancies
\item Report to system administrator if data corruption suspected
\end{enumerate}

**Problem: Missing order history entries**

\begin{itemize}
\item **Check:** Order details view for complete history
\item **Verify:** You have permissions to view full history
\item **Report:** Missing entries to administrator for investigation
\end{itemize}

### Performance Issues

**Problem: System running slowly**

\begin{itemize}
\item **Solution 1:** Close unused browser tabs
\item **Solution 2:** Clear browser cache
\item **Solution 3:** Check internet connection speed
\item **Solution 4:** Contact IT if issue affects multiple users
\end{itemize}

**Problem: Large order volumes causing lag**

\begin{itemize}
\item **Use:** Grouped View to reduce visible orders
\item **Collapse:** Sections you're not actively working on
\item **Process:** Batch operations during off-peak hours
\item **Request:** System optimization from administrator if chronic
\end{itemize}

### Getting Help

**Internal Support:**

\begin{enumerate}
\item Contact your system administrator
\item Provide specific error messages or screenshots
\item Include Order ID if issue relates to specific order
\item Note your browser type and version
\end{enumerate}

**System Administration:**

\begin{itemize}
\item Email: [Admin email]
\item Phone: [Admin phone]
\item Working Hours: [Business hours]
\item Emergency Contact: [After hours contact]
\end{itemize}

**Documentation:**

\begin{itemize}
\item Refer to this user guide for detailed procedures
\item Check for system update announcements
\item Review requester guide to understand their perspective
\item Access technical documentation for advanced features
\end{itemize}

---

# БЪЛГАРСКА ВЕРСИЯ

## 1. Въведение

Добре дошли в **ръководството за снабдяване на PartPulse Orders**! Този изчерпателен наръчник ще ви помогне да управлявате пълния жизнен цикъл на поръчките от заявка до доставка.

### Какво е PartPulse Orders?

PartPulse Orders е уеб-базирана система за управление на снабдяването, предназначена за индустриални среди. Тя оптимизира целия процес на поръчка от заявка до доставка.

### Вашата роля като Снабдител

Като потребител в отдел снабдяване, вие имате пълен достъп до:

\begin{itemize}
\item Преглед на всички поръчки от всички заявители в организацията
\item Актуализиране на статуса на поръчките през целия жизнен цикъл
\item Създаване и управление на оферти от доставчици
\item Проследяване на срокове за доставка и приоритети
\item Управление на пълния работен процес на поръчки
\item Достъп до изчерпателна история и анализи на поръчки
\end{itemize}

### Ключови отговорности

Вашите основни отговорности включват:

\begin{enumerate}
\item **Преглед на поръчки** - Оценка на входящи заявки за поръчки
\item **Управление на доставчици** - Получаване на оферти и поръчване от доставчици
\item **Актуализации на статус** - Информиране на заявителите за напредъка на поръчките
\item **Управление на срокове** - Осигуряване на навременна доставка
\item **Документация** - Поддържане на точни записи за оферти и транзакции
\item **Комуникация** - Координация между заявители и доставчици
\end{enumerate}

---

## 2. Начало на работа

### Достъп до системата

**[PLACEHOLDER ЗА СНИМКА 1: Екран за вход с данни за снабдяване]**

\begin{enumerate}
\item Отворете вашия уеб браузър (препоръчват се Chrome, Firefox или Edge)
\item Навигирайте до URL адреса на PartPulse Orders
\item Въведете вашето потребителско име и парола за снабдяване
\item Кликнете "Вход" за достъп до таблото за снабдяване
\end{enumerate}

### Първоначална настройка

След първото ви влизане:

\begin{itemize}
\item Проверете вашата профилна информация
\item Прегледайте системните известия
\item Запознайте се с оформлението на интерфейса
\item Проверете за чакащи поръчки, изискващи незабавно внимание
\end{itemize}

### Навигация в таблото

**[PLACEHOLDER ЗА СНИМКА 2: Табло за снабдяване с обозначени секции]**

Таблото за снабдяване е разделено на няколко ключови области:

\begin{table}
\begin{tabular}{|l|p{9cm}|}
\hline
\textbf{Секция} & \textbf{Предназначение} \\
\hline
Лента за навигация & Меню за навигация, известия и достъп до профил \\
\hline
Превключване на изглед & Превключване между плосък и групиран изглед \\
\hline
Лента за създаване на оферти & Бърз достъп за създаване на оферти от доставчици \\
\hline
Таблица с активни поръчки & Всички текущи поръчки, изискващи внимание \\
\hline
Стари доставени поръчки & Исторически доставени поръчки (свиваема) \\
\hline
\end{tabular}
\caption{Преглед на секциите на таблото}
\end{table}

---

## 3. Преглед на таблото

### Разбиране на интерфейса за снабдяване

**[PLACEHOLDER ЗА СНИМКА 3: Пълно табло за снабдяване с етикети]**

За разлика от изгледа за заявители, интерфейсът за снабдяване предоставя допълнителни инструменти и контроли:

### Лента за създаване на оферти

**[PLACEHOLDER ЗА СНИМКА 4: Подчертана лента за създаване на оферти]**

Разположена в горната част на секцията с поръчки, тази лента ви позволява да:

\begin{itemize}
\item Бързо създавате оферти за поръчки
\item Въвеждате информация за доставчик
\item Въвеждате детайли за ценообразуване
\item Добавяте оценки за време на доставка
\end{itemize}

### Режими на изглед

**Плосък изглед:**
\begin{itemize}
\item Една изчерпателна таблица
\item Всички поръчки видими наведнъж
\item Сортирани по приоритет (Спешно → Високо → Нормално → Ниско)
\item Най-добър за масова обработка
\end{itemize}

**[PLACEHOLDER ЗА СНИМКА 5: Плосък изглед за снабдяване]**

**Групиран изглед:**
\begin{itemize}
\item Поръчки организирани по статус
\item Отделни свиваеми секции за всеки етап
\item По-лесно фокусиране върху специфични етапи на работния процес
\item По-добър за етапна обработка
\end{itemize}

**[PLACEHOLDER ЗА СНИМКА 6: Групиран изглед за снабдяване]**

### Колони в таблицата с поръчки

**[PLACEHOLDER ЗА СНИМКА 7: Таблица с поръчки с всички видими колони]**

Таблицата с поръчки за снабдяване включва всички колони, видими за заявителите, плюс:

\begin{table}
\begin{tabular}{|l|p{8cm}|}
\hline
\textbf{Колона} & \textbf{Описание} \\
\hline
ID на поръчка & Уникален идентификатор за проследяване \\
\hline
Каталожен номер & Код на производителя или вътрешен код \\
\hline
Описание & Детайлно описание на артикула \\
\hline
Количество & Заявено количество с мерна единица \\
\hline
Статус & Текущ етап на поръчката (редактируем) \\
\hline
Приоритет & Ниво на спешност, зададено от заявителя \\
\hline
Заявител & Служител, подал поръчката \\
\hline
Създадена & Дата на подаване на поръчката \\
\hline
Необходимо до & Заявена дата за доставка \\
\hline
Статус на доставка & Индикатор за срок (Навреме, Предстои, Закъсняла) \\
\hline
Действия & Преглед на детайли, актуализация на статус, създаване на оферта \\
\hline
\end{tabular}
\caption{Колони в таблицата с поръчки за снабдяване}
\end{table}

### Индикатори за приоритет

Поръчките са цветово кодирани по приоритет:

\begin{table}
\begin{tabular}{|l|l|l|}
\hline
\textbf{Приоритет} & \textbf{Цвят} & \textbf{Необходимо действие} \\
\hline
Спешно & Червен & Незабавно внимание - същия ден \\
\hline
Високо & Оранжев & Обработка в рамките на 24 часа \\
\hline
Нормално & Син & Стандартен срок за обработка \\
\hline
Ниско & Сив & Обработка при наличие на капацитет \\
\hline
\end{tabular}
\caption{Цветово кодиране на приоритети}
\end{table>

---

## 4. Управление на поръчки

### Преглед на жизнения цикъл на поръчката

Като специалист по снабдяване, вие управлявате поръчките през шест основни етапа:

\begin{enumerate}
\item **Чакаща** - Нови поръчки, очакващи вашия първоначален преглед
\item **В преглед** - Поръчки, които активно оценявате
\item **Оферирана** - Поръчки с приложени оферти от доставчици
\item **Поръчана** - Поръчки, направени при доставчици
\item **В транзит** - Поръчки, изпратени и в процес на доставка
\item **Доставена** - Поръчки, получени от заявителя
\end{enumerate}

**[PLACEHOLDER ЗА СНИМКА 8: Диаграма на жизнения цикъл на поръчката]**

### Преглед на нови поръчки

**[PLACEHOLDER ЗА СНИМКА 9: Секция с чакащи поръчки]**

Когато пристигнат нови поръчки:

\begin{enumerate}
\item Проверете секцията **Чакащи** (или значката "Чакащи" в плосък изглед)
\item Прегледайте детайлите на поръчката:
  \begin{itemize}
  \item Каталожен номер и описание
  \item Количество и мерна единица
  \item Необходима дата
  \item Ниво на приоритет
  \item Бележки на заявителя
  \end{itemize}
\item Оценете осъществимостта и опциите за доставчици
\item Актуализирайте статуса на "В преглед", когато започнете обработка
\end{enumerate}

### Преглед на детайли за поръчка

**[PLACEHOLDER ЗА СНИМКА 10: Модален прозорец с детайли за поръчка]**

\begin{enumerate}
\item Кликнете **иконата "око"** в колоната Действия
\item Детайлният изглед показва:
  \begin{itemize}
  \item Пълна информация за поръчката
  \item Пълна история на поръчката с времеви печати
  \item Всички промени в статуса и кой ги е направил
  \item Бележки и коментари
  \item Приложени оферти
  \item Контактна информация на заявителя
  \end{itemize}
\end{enumerate}

### Филтриране и търсене

**По приоритет:**
\begin{itemize}
\item Фокусирайте се първо върху спешните поръчки
\item Използвайте цветовото кодиране за бърза идентификация
\end{itemize}

**По статус:**
\begin{itemize}
\item Използвайте групирания изглед за виждане на поръчки по етап
\item Кликнете заглавията на секциите за разширяване/свиване
\end{itemize}

**По заявител:**
\begin{itemize}
\item Сортирайте таблицата по колоната Заявител
\item Обработвайте групово поръчки от един и същ отдел
\end{itemize}

**По дата:**
\begin{itemize}
\item Сортирайте по "Необходимо до" за приоритизиране на спешни срокове
\item Проверете колоната "Статус на доставка" за предупреждения за срокове
\end{itemize}

### Страниране

**[PLACEHOLDER ЗА СНИМКА 11: Контроли за страниране]**

\begin{itemize}
\item Таблиците показват 20 поръчки на страница по подразбиране
\item Използвайте бутоните Предишна/Следваща за навигация
\item Номерата на страниците показват общия брой налични страници
\item Обмислете използването на групиран изглед за по-добра организация при големи обеми поръчки
\end{itemize}

---

## 5. Създаване и управление на оферти

### Кога да създадете оферта

Създавайте оферти когато:

\begin{itemize}
\item Сте получили ценообразуване от доставчик
\item Поръчката е оценена и е готова за одобрение
\item Заявителят се нуждае от информация за разходи за бюджетиране
\item Сравнявате множество опции от доставчици
\end{itemize}

### Процес на създаване на оферта

**[PLACEHOLDER ЗА СНИМКА 12: Лента за създаване на оферти с обозначени полета]**

\begin{enumerate}
\item Намерете поръчката в таблицата с активни поръчки
\item Използвайте лентата за създаване на оферти в горната част на екрана
\item Попълнете задължителните полета:
\end{enumerate}

\begin{table}
\begin{tabular}{|l|p{9cm}|}
\hline
\textbf{Поле} & \textbf{Какво да въведете} \\
\hline
Изберете поръчка & Изберете поръчката от падащото меню \\
\hline
Име на доставчик & Въведете името на доставчика, предоставящ офертата \\
\hline
Обща цена & Въведете офертната цена (включително валута) \\
\hline
Време за доставка & Приблизителен срок за доставка от доставчика \\
\hline
Бележки (по избор) & Допълнителна информация за офертата \\
\hline
\end{tabular}
\caption{Полета за създаване на оферта}
\end{table}

**[PLACEHOLDER ЗА СНИМКА 13: Попълнен формуляр за създаване на оферта]**

### Подаване на оферта

\begin{enumerate}
\item Прегледайте цялата информация за точност
\item Кликнете бутон **"Създай оферта"**
\item Системата автоматично актуализира статуса на поръчката на "Оферирана"
\item Информацията за офертата се записва в историята на поръчката
\item Заявителят вече може да види детайлите на офертата
\end{enumerate}

**[PLACEHOLDER ЗА СНИМКА 14: Потвърждение за подаване на оферта]**

### Добри практики за оферти

\begin{itemize}
\item **Включете всички разходи** - Общата цена трябва да включва доставка, данъци и др.
\item **Бъдете конкретни** - Отбелязвайте специални условия в полето за бележки
\item **Точност на сроковете** - Предоставяйте реалистични оценки за време на доставка
\item **Множество оферти** - Обмислете създаването на множество оферти за сравнение
\item **Документация** - Пазете документи с оферти от доставчици за справка
\end{itemize}

### Редактиране на оферти

**Забележка:** След като офертата е създадена, тя става част от историята на поръчката. За промяна:

\begin{enumerate}
\item Свържете се с вашия системен администратор
\item Или създайте нова оферта с актуализирана информация
\item Добавете бележки, обясняващи промяната
\end{enumerate}

### Процес на одобрение на оферта

След създаване на оферта:

\begin{enumerate}
\item Офертата е видима за заявителя и ръководството
\item Може да се изисква одобрение в зависимост от сумата (според политиката на компанията)
\item След одобрение, актуализирайте статуса на поръчката на "Поръчана"
\item Продължете с направата на поръчка при доставчика
\end{enumerate}

---

## 6. Актуализиране на статус на поръчки

### Работен процес за актуализация на статус

**[PLACEHOLDER ЗА СНИМКА 15: Падащо меню за актуализация на статус в колоната действия]**

Поддържането на актуален статус на поръчката е критично за видимостта на заявителя и управлението на работния процес.

### Как да актуализирате статуса

**Метод 1: От таблицата с поръчки**
\begin{enumerate}
\item Намерете поръчката в таблицата
\item Кликнете на текущата **значка за статус**
\item Изберете новия статус от падащото меню
\item Потвърдете актуализацията
\end{enumerate}

**Метод 2: От детайлите на поръчката**
\begin{enumerate}
\item Кликнете иконата "око" за отваряне на детайлите на поръчката
\item Намерете секцията за актуализация на статус
\item Изберете нов статус от падащото меню
\item Добавете бележки при необходимост
\item Кликнете "Актуализирай статус"
\end{enumerate}

**[PLACEHOLDER ЗА СНИМКА 16: Актуализация на статус в изгледа с детайли за поръчка]**

### Ръководство за напредъка на статуса

\begin{table}
\begin{tabular}{|l|p{7cm}|l|}
\hline
\textbf{От статус} & \textbf{Опции за следващ статус} & \textbf{Кога да актуализирате} \\
\hline
Чакаща & В преглед & Когато започнете обработка \\
\hline
В преглед & Оферирана & След получаване на оферта от доставчик \\
\hline
Оферирана & Поръчана & След направа на поръчка при доставчик \\
\hline
Поръчана & В транзит & Когато доставчикът потвърди изпращане \\
\hline
В транзит & Доставена & Когато заявителят получи артикула \\
\hline
\end{tabular}
\caption{Типичен напредък на статуса}
\end{table}

### Известия за промяна на статус

Когато актуализирате статус:

\begin{itemize}
\item Промяната се записва в историята на поръчката с времеви печат
\item Вашето потребителско име се записва като лице, направило актуализацията
\item Заявителят вижда актуализирания статус незабавно
\item Системата проверява срока за доставка и актуализира индикатора "Статус на доставка"
\end{itemize}

### Специални актуализации на статус

**Маркиране като доставена:**

\begin{enumerate}
\item Потвърдете със заявителя, че артикулът е получен
\item Актуализирайте статуса на "Доставена"
\item Системата записва датата на доставка
\item Поръчката се премества в секцията "Стари доставени" след 7 дни
\end{enumerate}

**[PLACEHOLDER ЗА СНИМКА 17: Потвърждение за доставена поръчка]**

**Обработка на забавяния:**

Ако поръчката е забавена:

\begin{itemize}
\item Актуализирайте статуса, за да отразява точно текущия етап
\item Добавете подробни бележки, обясняващи забавянето
\item Свържете се проактивно със заявителя относно промени в срока
\item Актуализирайте "Необходимо до", ако заявителят се съгласи с удължаване
\end{itemize}

### Масови актуализации на статус

За ефективна обработка на множество поръчки:

\begin{enumerate}
\item Използвайте групирания изглед за фокусиране върху специфични групи по статус
\item Обработвайте всички поръчки "В преглед" заедно
\item Преместете групата на "Оферирана" след получаване на множество оферти
\item Актуализирайте на "Поръчана" след направа на множество поръчки при доставчици
\end{enumerate}

---

## 7. Разширени функции

### Ефективно използване на групирания изглед

**[PLACEHOLDER ЗА СНИМКА 18: Групиран изглед с всички видими секции]**

Групираният изглед организира поръчките в свиваеми секции:

\begin{itemize}
\item **Чакащи поръчки** - Нови заявки, очакващи първоначален преглед
\item **В преглед** - Поръчки, които се обработват активно
\item **Оферирани** - Поръчки с приложени оферти от доставчици
\item **Поръчани** - Поръчки, направени при доставчици
\item **В транзит** - Поръчки, които в момента се доставят
\item **Доставени (Скорошни)** - Поръчки, доставени през последните 7 дни
\end{itemize}

**Предимства:**
\begin{itemize}
\item Фокусиране върху един етап на работния процес наведнъж
\item Намаляване на претъпканост на екрана
\item По-добра визуализация на процеса
\item По-лесна координация в екипа
\end{itemize}

**Съвети:**
\begin{itemize}
\item Свивайте секции, над които не работите активно
\item Значките с брой показват колко поръчки има във всяка секция
\item Кликвайте заглавията на секциите за разширяване/свиване
\end{itemize}

### Управление на срокове за доставка

**Разбиране на индикаторите за статус на доставка:**

**[PLACEHOLDER ЗА СНИМКА 19: Примери за статус на доставка]**

\begin{table}
\begin{tabular}{|l|l|p{7cm}|}
\hline
\textbf{Индикатор} & \textbf{Цвят} & \textbf{Значение и действие} \\
\hline
✓ Навреме & Зелен & Доставката се очаква преди необходимата дата - не се изисква действие \\
\hline
⚠ Предстои & Жълт & 2 дни или по-малко до необходимата дата - приоритизирайте поръчката \\
\hline
⚠ Закъсняла & Червен & Минала е необходимата дата - ускорете или комуникирайте със заявителя \\
\hline
✓ Доставена & Зелен & Успешно доставена - не се изисква действие \\
\hline
\end{tabular}
\caption{Индикатори за статус на доставка}
\end{table>

**Проактивно управление на срокове:**

\begin{enumerate}
\item Сортирайте поръчки по "Необходимо до" за виждане на предстоящи крайни срокове
\item Фокусирайте се върху поръчки "Предстои" (жълт индикатор)
\item Свържете се с доставчици за ускоряване на "Закъснели" поръчки
\item Комуникирайте реалистични срокове със заявители
\end{enumerate}

### Секция "Стари доставени поръчки"

**[PLACEHOLDER ЗА СНИМКА 20: Секция "Стари доставени поръчки"]**

Поръчки, доставени преди повече от 7 дни, се преместват в тази секция:

\begin{itemize}
\item Секцията е свита по подразбиране за намаляване на претъпканост
\item Кликнете за разширяване и преглед на исторически доставки
\item Значката с брой показва общия брой стари доставени поръчки
\item Включва колона "Доставена дата"
\item Търсима за исторически справки
\end{itemize}

**Случаи на употреба:**
\begin{itemize}
\item Справка за ценообразуване за подобни поръчки
\item Проверка на времето за доставка от специфични доставчици
\item Преглед на модели на поръчки на заявители
\item Проверка на завършване на поръчки за отчитане
\end{itemize}

### Работа с множество заявители

**Отговорности на координатора:**

\begin{itemize}
\item Наблюдавайте поръчки от всички отдели
\item Приоритизирайте въз основа на бизнес въздействие, не само на индивидуални етикети за приоритет
\item Балансирайте натоварването между множество заявители
\item Идентифицирайте модели в повтарящи се поръчки за оптимизация
\end{itemize}

**Съвети за комуникация:**

\begin{itemize}
\item Използвайте ID на поръчката при комуникация за специфични поръчки
\item Информирайте проактивно заявителите за забавяния или проблеми
\item Задавайте очаквания за срокове на обработка
\item Документирайте всички комуникации в бележките на поръчката
\end{itemize}

### Системни известия

Проверявайте за:
\begin{itemize}
\item Нови подадени поръчки (статус "Чакаща")
\item Поръчки, наближаващи "Необходимо до" (Предстои)
\item Поръчки след "Необходимо до" (Закъсняла)
\item Поръчки, изискващи актуализация на оферти
\end{itemize}

---

## 8. Отчети и анализи

### Проследяване на обема на поръчки

Наблюдавайте ключови метрики:

\begin{itemize}
\item Общо поръчки по статус
\item Поръчки по ниво на приоритет
\item Поръчки по заявител
\item Средно време за обработка на етап
\item Процент навременни доставки
\end{itemize}

### Показатели за ефективност

**Метрики за ефикасност:**

\begin{table}
\begin{tabular}{|l|p{8cm}|}
\hline
\textbf{Метрика} & \textbf{Цел / Добра практика} \\
\hline
Чакаща до В преглед & В рамките на 4 часа за спешни, 24 часа за останалите \\
\hline
В преглед до Оферирана & 1-2 работни дни \\
\hline
Оферирана до Поръчана & Същия ден след одобрение \\
\hline
Поръчана до В транзит & Зависи от доставчика (проследявайте средната) \\
\hline
В транзит до Доставена & Зависи от метода на доставка \\
\hline
Процент навременни доставки & Цел 95\% или по-високо \\
\hline
\end{tabular}
\caption{Целеви показатели за ефективност}
\end{table}

### Ефективност на доставчиците

Проследявайте метрики за доставчици:

\begin{itemize}
\item Време за отговор на оферта
\item Конкурентоспособност на ценообразуването
\item Надеждност на доставката
\item Качество на доставени артикули
\item Отзивчивост на комуникацията
\end{itemize}

### Използване на исторически данни

**[PLACEHOLDER ЗА СНИМКА 21: Анализ на исторически поръчки]**

Секцията "Стари доставени поръчки" предоставя ценни данни:

\begin{itemize}
\item Преглеждайте минали поръчки за подобни части
\item Проверявайте исторически тенденции в ценообразуването
\item Идентифицирайте надеждни доставчици за специфични артикули
\item Анализирайте сезонни модели на поръчки
\item Планирайте инвентар въз основа на повтарящи се нужди
\end{itemize}

---

## 9. Съвети и добри практики

### Ежедневен контролен списък за работен процес

**Сутрешна рутина:**

\begin{enumerate}
\item Влезте и проверете за нови чакащи поръчки
\item Прегледайте поръчки със статус "Предстои"
\item Адресирайте всякакви поръчки със статус "Закъсняла"
\item Проверете за имейли от доставчици с оферти или актуализации за изпращане
\item Приоритизирайте спешни и високи приоритетни поръчки
\end{enumerate}

**През деня:**

\begin{enumerate}
\item Актуализирайте статуса, докато напредвате през етапите на работния процес
\item Създавайте оферти веднага щом получите информация от доставчик
\item Комуникирайте проактивно със заявители за забавяния
\item Документирайте цялата важна информация в бележките на поръчката
\end{enumerate}

**Край на деня:**

\begin{enumerate}
\item Уверете се, че всички актуализации на статус са актуални
\item Последвайте чакащи комуникации с доставчици
\item Прегледайте предстоящите крайни срокове за утре (Необходимо до)
\item Актуализирайте всички поръчки, преместени на "В транзит" днес
\end{enumerate}

### Ефективно управление на оферти

\begin{itemize}
\item **Получавайте множество оферти** - Сравнявайте поне 2-3 доставчици, когато е възможно
\item **Пълна прозрачност на разходите** - Включете всички такси в общата цена
\item **Реалистични срокове** - Проверявайте времето за доставка с доставчици
\item **Документирайте всичко** - Използвайте полето за бележки за важни детайли
\item **Бърз отговор** - Създавайте оферти незабавно след получаване на информация от доставчик
\end{itemize}

### Добри практики за актуализация на статус

\begin{itemize}
\item **Актуализирайте често** - Поддържайте статуса актуален през деня
\item **Бъдете точни** - Актуализирайте само до следващия етап, когато действително е достигнат
\item **Добавяйте контекст** - Използвайте бележки за обяснение на забавяния или проблеми
\item **Незабавни актуализации** - Актуализирайте на "Доставена" веднага след потвърждение
\item **Последователен напредък** - Следвайте логичния поток на статуса
\end{itemize}

### Управление на приоритети

**Обработка на конфликтни приоритети:**

\begin{table}
\begin{tabular}{|l|p{9cm}|}
\hline
\textbf{Сценарий} & \textbf{Подход} \\
\hline
Множество спешни & Обработвайте по "Необходимо до" (най-ранни първо) \\
\hline
Спешни срещу голям обем високи & Адресирайте спешни първо, обработвайте високи на партиди \\
\hline
Закъснели поръчки & Приоритизирайте дори над нови спешни поръчки \\
\hline
Конфликтни дати & Комуникирайте със заявители за коригиране на очаквания \\
\hline
\end{tabular}
\caption{Разрешаване на конфликт на приоритети}
\end{table>

### Стратегии за комуникация

**Със заявители:**

\begin{itemize}
\item Задавайте ясни очаквания за срокове на обработка
\item Комуникирайте проактивно забавяния или проблеми
\item Предоставяйте оценки за доставка при актуализиране на "Поръчана"
\item Потвърдете доставката със заявителя преди маркиране като "Доставена"
\end{itemize}

**С доставчици:**

\begin{itemize}
\item Установете предпочитани канали за комуникация
\item Поискайте информация за проследяване на изпращания
\item Изградете взаимоотношения за приоритетна обработка
\item Документирайте всички ангажименти и обещания
\end{itemize}

**Вътрешен екип:**

\begin{itemize}
\item Споделяйте прозрения за ефективността на доставчиците
\item Координирайте се при големи или сложни поръчки
\item Стандартизирайте процеси в екипа
\item Взаимно обучавайте за покритие при отсъствия
\end{itemize}

### Оптимизиране на работния процес

**Групова обработка:**

\begin{itemize}
\item Групирайте подобни поръчки от един и същ доставчик
\item Обработвайте всички оферти заедно в специфични времеви блокове
\item Актуализирайте множество статуси след комуникация с доставчик
\item Преглеждайте всички чакащи поръчки на планирани интервали
\end{itemize}

**Стратегическо използване на режими на изглед:**

\begin{itemize}
\item **Плосък изглед** за бързо сканиране и групови операции
\item **Групиран изглед** за фокусирана етапна обработка
\item Превключвайте между изгледи въз основа на текущата задача
\end{itemize}

**Намаляване на времето за отговор:**

\begin{itemize}
\item Предварително квалифицирайте доставчици за често срещани части
\item Поддържайте контактна информация на доставчици лесно достъпна
\item Използвайте бележките на поръчката като регистър за комуникация
\item Настройте шаблони за имейли за чести отговори
\end{itemize}

---

## 10. Отстраняване на проблеми

### Чести проблеми и решения

**Проблем: Създаването на оферта не успява или не се появява**

**[PLACEHOLDER ЗА СНИМКА 22: Пример за грешка при създаване на оферта]**

\begin{itemize}
\item **Решение 1:** Проверете дали всички задължителни полета са попълнени
\item **Решение 2:** Проверете дали е избрана поръчка от падащото меню
\item **Решение 3:** Уверете се, че общата цена съдържа само цифри и символ за валута
\item **Решение 4:** Опреснете страницата и опитайте отново
\end{itemize}

**Проблем: Актуализацията на статуса не се записва**

\begin{itemize}
\item **Решение 1:** Проверете интернет връзката
\item **Решение 2:** Проверете дали имате права за снабдяване
\item **Решение 3:** Опреснете страницата и повторете актуализацията
\item **Решение 4:** Свържете се с администратор, ако проблемът продължава
\end{itemize}

**Проблем: Поръчките не се появяват в правилната секция за статус**

\begin{itemize}
\item **Решение:** Опреснете страницата (F5 или бутон за опресняване на браузъра)
\item **Проверка:** Уверете се, че преглеждате правилния режим на изглед (плосък срещу групиран)
\item **Проверка:** Статусът на поръчката е това, което очаквате в детайлите на поръчката
\end{itemize}

**Проблем: Не мога да видя всички поръчки**

\begin{itemize}
\item **Решение 1:** Проверете страниирането - навигирайте през множество страници
\item **Решение 2:** Разширете всички секции в групирания изглед
\item **Решение 3:** Проверете дали сте влезли с акаунт за снабдяване
\item **Решение 4:** Проверете дали са приложени филтри (ако филтрирането е налично)
\end{itemize}

**Проблем: Статусът на доставка показва "Закъсняла" за доставена поръчка**

\begin{itemize}
\item **Решение:** Това е поправено във версия 2.7
\item **Действие:** Опреснете кеша на браузъра (Ctrl+F5)
\item **Проверка:** Статусът на поръчката е зададен на "Доставена"
\end{itemize}

**Проблем: Стари доставени поръчки се показват в активната таблица**

\begin{itemize}
\item **Решение:** Поправено във версия 2.7 - поръчки над 7 дни автоматично се преместват
\item **Действие:** Опреснете страницата, за да видите правилната организация
\item **Проверка:** Датата на доставка е правилно записана
\end{itemize}

**Проблем: Бутоните за превключване на изглед не работят**

\begin{itemize}
\item **Решение:** Изчистете кеша на браузъра и опреснете
\item **Проверка:** Използвате поддържан браузър (Chrome, Firefox, Edge)
\item **Актуализация:** Уверете се, че системата работи с версия 2.7 или по-висока
\end{itemize}

### Проблеми с целостта на данните

**Проблем: Информацията за поръчката изглежда неправилна**

\begin{enumerate}
\item Отворете изгледа с детайли за поръчката
\item Прегледайте историята на поръчката за неоторизирани промени
\item Свържете се със заявителя за проверка на информацията
\item Документирайте всякакви несъответствия
\item Докладвайте на системния администратор, ако се подозира повреда на данни
\end{enumerate}

**Проблем: Липсващи записи в историята на поръчката**

\begin{itemize}
\item **Проверка:** Изглед с детайли за поръчката за пълна история
\item **Проверка:** Имате разрешения за преглед на пълната история
\item **Докладване:** Липсващи записи на администратор за разследване
\end{itemize}

### Проблеми с производителността

**Проблем: Системата работи бавно**

\begin{itemize}
\item **Решение 1:** Затворете неизползвани раздели на браузъра
\item **Решение 2:** Изчистете кеша на браузъра
\item **Решение 3:** Проверете скоростта на интернет връзката
\item **Решение 4:** Свържете се с IT, ако проблемът засяга множество потребители
\end{itemize}

**Проблем: Големи обеми поръчки причиняват забавяне**

\begin{itemize}
\item **Използвайте:** Групиран изглед за намаляване на видимите поръчки
\item **Свивайте:** Секции, над които не работите активно
\item **Обработвайте:** Групови операции в часове извън пиковата натовареност
\item **Поискайте:** Оптимизация на системата от администратор, ако е хронично
\end{itemize}

### Получаване на помощ

**Вътрешна поддръжка:**

\begin{enumerate}
\item Свържете се с вашия системен администратор
\item Предоставете специфични съобщения за грешки или снимки на екрана
\item Включете ID на поръчката, ако проблемът се отнася до специфична поръчка
\item Отбележете типа и версията на вашия браузър
\end{enumerate}

**Системна администрация:**

\begin{itemize}
\item Имейл: [Имейл на администратор]
\item Телефон: [Телефон на администратор]
\item Работно време: [Работни часове]
\item Спешен контакт: [Контакт извън работно време]
\end{itemize}

**Документация:**

\begin{itemize}
\item Обърнете се към това ръководство за подробни процедури
\item Проверете за съобщения за актуализации на системата
\item Прегледайте ръководството за заявители, за да разберете тяхната перспектива
\item Достъпете техническа документация за разширени функции
\end{itemize}

---

## Document Information | Информация за документа

**Document Version:** 2.7 | **Версия на документа:** 2.7  
**Last Updated:** February 24, 2026 | **Последна актуализация:** 24 февруари 2026  
**Prepared By:** PartPulse Development Team | **Подготвено от:** Екип за разработка на PartPulse  
**For:** Procurement and Admin Users | **За:** Потребители снабдяване и администратор

---

**End of User Guide | Край на ръководството**
