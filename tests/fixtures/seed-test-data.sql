-- PartPulse Orders staging demonstration dataset.
-- Load only into a non-production staging database after schema/partpulse_orders.sql.
-- Known plaintext for every account below: StagingTest!2026
-- The shared hash is bcrypt ($2b$, cost 12) for that plaintext.

START TRANSACTION;

INSERT INTO users
    (id, username, password_hash, name, email, phone, sms_notifications_enabled,
     role, building, active, notification_email, email_notifications_enabled)
VALUES
    (1001, 'stg_admin',       '$2b$12$UmPYnHkvxsgk1hbsigsRcetMM/SfnVPDBaaTKJtJPCPdfpVfF5p66', 'Иван Петров',    'ivan.petrov@staging.partpulse.invalid',    '+359888100101', 0, 'admin',       NULL,   1, 'ivan.petrov@staging.partpulse.invalid',    1),
    (1002, 'stg_procurement', '$2b$12$UmPYnHkvxsgk1hbsigsRcetMM/SfnVPDBaaTKJtJPCPdfpVfF5p66', 'Мария Георгиева','maria.georgieva@staging.partpulse.invalid', '+359888100102', 0, 'procurement', 'SOF1', 1, 'maria.georgieva@staging.partpulse.invalid', 1),
    (1003, 'stg_requester',   '$2b$12$UmPYnHkvxsgk1hbsigsRcetMM/SfnVPDBaaTKJtJPCPdfpVfF5p66', 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid',   '+359888100103', 0, 'requester',   'SOF1', 1, 'nikolay.dimov@staging.partpulse.invalid',   1),
    (1004, 'stg_manager',     '$2b$12$UmPYnHkvxsgk1hbsigsRcetMM/SfnVPDBaaTKJtJPCPdfpVfF5p66', 'Елена Стоянова','elena.stoyanova@staging.partpulse.invalid', '+359888100104', 0, 'manager',     'SOF1', 1, 'elena.stoyanova@staging.partpulse.invalid', 1),
    (1005, 'stg_accounting',  '$2b$12$UmPYnHkvxsgk1hbsigsRcetMM/SfnVPDBaaTKJtJPCPdfpVfF5p66', 'Борислав Илиев','borislav.iliev@staging.partpulse.invalid', '+359888100105', 0, 'accounting',  'SOF2', 1, 'borislav.iliev@staging.partpulse.invalid', 1),
    -- A second requester exists so that order-visibility rules can actually be
    -- tested. With a single requester every order belongs to that person, and a
    -- broken scope filter looks identical to a working one.
    (1006, 'stg_requester2',  '$2b$12$UmPYnHkvxsgk1hbsigsRcetMM/SfnVPDBaaTKJtJPCPdfpVfF5p66', 'Петър Иванов',  'petar.ivanov@staging.partpulse.invalid',   '+359888100106', 0, 'requester',   'SOF2', 1, 'petar.ivanov@staging.partpulse.invalid',   1);

INSERT INTO buildings (id, code, name, description, active) VALUES
    (101, 'SOF1', 'София - Централен склад', 'Основен склад и сервизна база в София.', 1),
    (102, 'SOF2', 'София - Производство', 'Производствена площадка в София.', 1),
    (103, 'PDV1', 'Пловдив - Логистичен център', 'Регионален логистичен център.', 1),
    (104, 'VAR1', 'Варна - Морска база', 'Сервизна база и склад във Варна.', 1);

INSERT INTO cost_centers (id, building_code, code, name, description, active) VALUES
    (201, 'SOF1', 'SOF1-MNT', 'Поддръжка София', 'Резервни части и аварийни ремонти.', 1),
    (202, 'SOF1', 'SOF1-ENG', 'Инженеринг София', 'Инженерни подобрения и инструменти.', 1),
    (203, 'SOF2', 'SOF2-PRD', 'Производство София', 'Консумативи за производствените линии.', 1),
    (204, 'PDV1', 'PDV1-LOG', 'Логистика Пловдив', 'Оборудване за складова логистика.', 1),
    (205, 'VAR1', 'VAR1-MNT', 'Поддръжка Варна', 'Поддръжка на морската база.', 1),
    (206, 'VAR1', 'VAR1-HSE', 'Безопасност Варна', 'Лични предпазни средства и безопасност.', 1);

INSERT INTO building_managers (id, building_id, user_id) VALUES
    (111, 101, 1004),
    (112, 102, 1004),
    (113, 103, 1004),
    (114, 104, 1004);

INSERT INTO suppliers
    (id, name, contact_person, email, phone, address, country, is_eu, website, notes,
     active, specialization, keywords, category_tags, performance_score, total_orders, last_order_date)
VALUES
    (301, 'Пневматика България ООД', 'Десислава Костова', 'sales@pneumatika-bg.example', '+35929810001', 'бул. Ботевградско шосе 272, София', 'BG', 1, 'https://supplier.example/pneumatika-bg', 'Български дистрибутор на пневматика.', 1, 'Пневматика', 'цилиндри, клапани, маркучи, фитинги', 'pneumatics,maintenance', 8.7, 14, NOW() - INTERVAL 3 DAY),
    (302, 'Festo SE & Co. KG', 'Anna Müller', 'sales@festo.example', '+49711900001', 'Ruiter Straße 82, Esslingen', 'DE', 1, 'https://supplier.example/festo', 'EU доставчик с кратки срокове за стандартни компоненти.', 1, 'Автоматизация', 'festo, пневматика, сензори, клапани', 'automation,pneumatics', 9.2, 22, NOW() - INTERVAL 7 DAY),
    (303, 'SKF Sverige AB', 'Lars Nyberg', 'orders@skf.example', '+46426900001', 'Hornsgatan 1, Göteborg', 'SE', 1, 'https://supplier.example/skf', 'Лагери и уплътнения от ЕС.', 1, 'Лагери', 'лагери, ролки, уплътнения', 'bearings,mechanical', 8.9, 11, NOW() - INTERVAL 2 DAY),
    (304, 'Würth България ЕООД', 'Калин Христов', 'industrial@wurth-bg.example', '+35924810001', 'ул. Околовръстен път 467, София', 'BG', 1, 'https://supplier.example/wurth-bg', 'Инструменти и крепежни елементи.', 1, 'Инструменти и крепежи', 'винтове, инструменти, химикали', 'tools,fasteners', 8.3, 19, NOW() - INTERVAL 12 DAY),
    (305, 'Schaeffler Romania SRL', 'Andrei Popescu', 'industrial@Schaeffler-ro.example', '+40213100001', 'Str. Fabrica de Glucoză 5, București', 'RO', 1, 'https://supplier.example/schaeffler-ro', 'EU източник за лагери и ремъци.', 1, 'Задвижване', 'ремъци, лагери, шайби', 'bearings,transmission', 8.1, 7, NOW() - INTERVAL 21 DAY),
    (306, 'RS Components UK Ltd', 'Sophie Brown', 'eu-export@rs-uk.example', '+441530510001', 'Birchington Road, Corby', 'GB', 0, 'https://supplier.example/rs-uk', 'Не-ЕС след Brexit; следете митническите документи.', 1, 'Електроника', 'релета, предпазители, датчици', 'electrical,electronics', 7.8, 9, NOW() - INTERVAL 15 DAY),
    (307, 'Teknorot Otomotiv', 'Mehmet Kaya', 'export@teknorot.example', '+902166900001', 'Tuzla Organize Sanayi, İstanbul', 'TR', 0, 'https://supplier.example/teknorot', 'Не-ЕС производител на механични компоненти.', 1, 'Механични части', 'шарнири, втулки, механика', 'mechanical,vehicle', 7.2, 4, NOW() - INTERVAL 40 DAY),
    (308, 'Shenzhen Motion Controls', 'Li Wei', 'export@motion-controls.example', '+867558100001', 'Nanshan District, Shenzhen', 'CN', 0, 'https://supplier.example/shenzhen-motion', 'Не-ЕС доставчик за специални електронни модули.', 1, 'Контролери', 'PLC, контролери, HMI', 'automation,electronics', 6.9, 3, NOW() - INTERVAL 65 DAY);

INSERT INTO quotes
    (id, quote_number, supplier_id, status, total_amount, currency, valid_until, notes, created_by)
VALUES
    (401, 'Q-STG-2026-001', 302, 'Sent to Supplier', 485.00, 'EUR', CURRENT_DATE + INTERVAL 20 DAY, 'RFQ за пневматични компоненти.', 1002),
    (402, 'Q-STG-2026-002', 301, 'Received', 2580.10, 'BGN', CURRENT_DATE + INTERVAL 15 DAY, 'Получена оферта за цилиндри и фитинги.', 1002),
    (403, 'Q-STG-2026-003', 304, 'Under Approval', 980.00, 'BGN', CURRENT_DATE + INTERVAL 10 DAY, 'Оферта за комплект инструменти.', 1002),
    (404, 'Q-STG-2026-004', 303, 'Approved', 3249.96, 'EUR', CURRENT_DATE + INTERVAL 30 DAY, 'Одобрена оферта за лагери.', 1002),
    (405, 'Q-STG-2026-005', 307, 'Draft', 0.00, 'EUR', CURRENT_DATE + INTERVAL 45 DAY, 'Чернова за резервни механични части.', 1002);

INSERT INTO purchase_orders
    (id, po_number, quote_id, supplier_id, created_by, currency, total_amount, delivery_address,
     payment_terms, notes, status, sent_at, confirmed_at, expected_delivery_date,
     actual_delivery_date, invoice_expected, invoice_received)
VALUES
    (501, 'PO-STG-2026-001', 404, 303, 1002, 'EUR', 1450.00, 'София - Централен склад, бул. Ботевградско шосе 272', 'Net 30', 'Лагери за планиран ремонт.', 'confirmed', NOW() - INTERVAL 8 DAY, NOW() - INTERVAL 7 DAY, CURRENT_DATE + INTERVAL 7 DAY, NULL, 1, 0),
    (502, 'PO-STG-2026-002', 402, 301, 1002, 'BGN', 760.00, 'Пловдив - Логистичен център', 'Net 15', 'Пневматични фитинги за конвейер.', 'sent', NOW() - INTERVAL 4 DAY, NULL, CURRENT_DATE + INTERVAL 10 DAY, NULL, 1, 0),
    (503, 'PO-STG-2026-003', 404, 303, 1002, 'EUR', 900.00, 'Варна - Морска база', 'Net 30', 'Доставка на лагери на два етапа.', 'partially_delivered', NOW() - INTERVAL 12 DAY, NOW() - INTERVAL 11 DAY, CURRENT_DATE - INTERVAL 3 DAY, NULL, 1, 1),
    (504, 'PO-STG-2026-004', 402, 301, 1002, 'BGN', 530.00, 'София - Производство', 'Net 15', 'Доставени фитинги за линия 2.', 'delivered', NOW() - INTERVAL 20 DAY, NOW() - INTERVAL 19 DAY, CURRENT_DATE - INTERVAL 8 DAY, CURRENT_DATE - INTERVAL 6 DAY, 1, 1);

INSERT INTO orders
    (id, building, cost_center_id, item_description, part_number, category, quantity, date_needed,
     expected_delivery_date, notes, supplier_notes, priority, requester_id, requester_name,
     requester_email, status, supplier, supplier_id, quote_id, quote_ref, price, unit_price,
     total_price, assigned_to, submission_date, assigned_to_user_id, assigned_at,
     last_activity_at, assignment_notes, po_id, po_number, approval_status, approved_by,
     approved_at, cad_review_required, cad_status)
VALUES
    (1001, 'SOF1', 201, 'Комплект О-пръстени за пневматичен цилиндър', 'OR-50-NBR', 'Пневматика', 10, CURRENT_DATE + INTERVAL 14 DAY, NULL, 'Нужни за планова профилактика.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'New', NULL, NULL, NULL, NULL, 0.00, 0.00, 0.00, NULL, NOW() - INTERVAL 1 DAY, NULL, NULL, NOW() - INTERVAL 1 DAY, NULL, NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1002, 'SOF2', 203, 'Индуктивен датчик M18 PNP', 'IFM-IGS204', 'Сензори', 4, CURRENT_DATE + INTERVAL 8 DAY, NULL, 'Подмяна на датчици на линия 2.', NULL, 'High', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Pending', NULL, NULL, NULL, NULL, 0.00, 0.00, 0.00, 'maria.georgieva', NOW() - INTERVAL 2 DAY, 1002, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 4 HOUR, 'Чака техническо потвърждение.', NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1003, 'SOF1', 202, 'Електромагнитен клапан 5/2', 'VUVG-L10', 'Пневматика', 3, CURRENT_DATE + INTERVAL 12 DAY, NULL, 'Заявка за оферта е изпратена до Festo.', NULL, 'High', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Quote Requested', 'Festo SE & Co. KG', 302, 'Q-STG-2026-001', 401, 0.00, 0.00, 0.00, 'maria.georgieva', NOW() - INTERVAL 5 DAY, 1002, NOW() - INTERVAL 5 DAY, NOW() - INTERVAL 1 DAY, 'RFQ изпратена по имейл.', NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1004, 'PDV1', 204, 'Пневматичен цилиндър ISO 15552 D32', 'DNC-32-100', 'Пневматика', 2, CURRENT_DATE + INTERVAL 9 DAY, CURRENT_DATE + INTERVAL 6 DAY, 'Оферта получена; очаква избор.', 'Цена включва доставка до Пловдив.', 'Urgent', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Quote Received', 'Пневматика България ООД', 301, 'Q-STG-2026-002', 402, 640.00, 320.00, 640.00, 'maria.georgieva', NOW() - INTERVAL 6 DAY, 1002, NOW() - INTERVAL 6 DAY, NOW() - INTERVAL 2 HOUR, 'Сравняват се две оферти.', NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1005, 'SOF1', 202, 'Комплект динамометрични ключове', 'WURTH-TW-SET', 'Инструменти', 1, CURRENT_DATE + INTERVAL 18 DAY, NULL, 'Изисква управленско одобрение.', NULL, 'High', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Quote Under Approval', 'Würth България ЕООД', 304, 'Q-STG-2026-003', 403, 980.00, 980.00, 980.00, 'maria.georgieva', NOW() - INTERVAL 8 DAY, 1002, NOW() - INTERVAL 8 DAY, NOW() - INTERVAL 3 HOUR, 'Одобрение изпратено до Елена.', NULL, NULL, 'pending', NULL, NULL, 0, 'not_required'),
    (1006, 'VAR1', 205, 'Сферичен ролков лагер 22212', 'SKF-22212-E', 'Лагери', 2, CURRENT_DATE + INTERVAL 16 DAY, CURRENT_DATE + INTERVAL 11 DAY, 'Одобрено за морска помпа.', NULL, 'High', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Approved', 'SKF Sverige AB', 303, 'Q-STG-2026-004', 404, 900.00, 450.00, 900.00, 'maria.georgieva', NOW() - INTERVAL 9 DAY, 1002, NOW() - INTERVAL 9 DAY, NOW() - INTERVAL 5 HOUR, 'Готово за PO.', NULL, NULL, 'approved', 1004, NOW() - INTERVAL 1 DAY, 0, 'not_required'),
    (1007, 'SOF1', 201, 'Сачмен лагер 6205-2RS', 'SKF-6205-2RS', 'Лагери', 12, CURRENT_DATE + INTERVAL 10 DAY, CURRENT_DATE + INTERVAL 7 DAY, 'За резервен комплект на компресор.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Ordered', 'SKF Sverige AB', 303, 'Q-STG-2026-004', 404, 550.00, 45.83, 549.96, 'maria.georgieva', NOW() - INTERVAL 10 DAY, 1002, NOW() - INTERVAL 10 DAY, NOW() - INTERVAL 6 HOUR, 'PO-STG-2026-001 потвърдена.', 501, 'PO-STG-2026-001', 'approved', 1004, NOW() - INTERVAL 2 DAY, 0, 'not_required'),
    (1008, 'PDV1', 204, 'Бърза връзка за въздух G1/4', 'QS-G1-4', 'Пневматика', 20, CURRENT_DATE + INTERVAL 15 DAY, CURRENT_DATE + INTERVAL 10 DAY, 'Изпратена PO към местен доставчик.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'In Transit', 'Пневматика България ООД', 301, 'Q-STG-2026-002', 402, 760.00, 38.00, 760.00, 'maria.georgieva', NOW() - INTERVAL 11 DAY, 1002, NOW() - INTERVAL 11 DAY, NOW() - INTERVAL 1 DAY, 'Очаква се куриерска доставка.', 502, 'PO-STG-2026-002', 'not_required', NULL, NULL, 0, 'not_required'),
    (1009, 'VAR1', 205, 'Концентрична втулка за лагерен възел', 'SKF-H312', 'Лагери', 4, CURRENT_DATE - INTERVAL 2 DAY, CURRENT_DATE - INTERVAL 1 DAY, 'Доставени са два от четири броя.', NULL, 'Urgent', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Partially Delivered', 'SKF Sverige AB', 303, 'Q-STG-2026-004', 404, 360.00, 90.00, 360.00, 'maria.georgieva', NOW() - INTERVAL 14 DAY, 1002, NOW() - INTERVAL 14 DAY, NOW() - INTERVAL 6 HOUR, 'Остатъкът е потвърден за следваща седмица.', 503, 'PO-STG-2026-003', 'approved', 1004, NOW() - INTERVAL 5 DAY, 0, 'not_required'),
    (1010, 'VAR1', 205, 'Радиален лагер 6308', 'SKF-6308-2RS', 'Лагери', 2, CURRENT_DATE - INTERVAL 10 DAY, CURRENT_DATE - INTERVAL 8 DAY, 'Получен и монтиран на помпа.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Delivered', 'SKF Sverige AB', 303, 'Q-STG-2026-004', 404, 540.00, 270.00, 540.00, 'maria.georgieva', NOW() - INTERVAL 18 DAY, 1002, NOW() - INTERVAL 18 DAY, NOW() - INTERVAL 2 DAY, 'Доставката е приета.', 503, 'PO-STG-2026-003', 'approved', 1004, NOW() - INTERVAL 12 DAY, 0, 'not_required'),
    (1011, 'SOF2', 203, 'Реле 24VDC 2CO', 'RS-24V-2CO', 'Електроника', 8, CURRENT_DATE + INTERVAL 20 DAY, NULL, 'Отказана поради промяна в проекта.', NULL, 'Low', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Cancelled', 'RS Components UK Ltd', 306, NULL, NULL, 0.00, 0.00, 0.00, NULL, NOW() - INTERVAL 16 DAY, 1002, NOW() - INTERVAL 15 DAY, NOW() - INTERVAL 9 DAY, 'Проектът е отменен.', NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1012, 'SOF1', 202, 'PLC комуникационен модул', 'SMC-PLC-ETH', 'Автоматизация', 1, CURRENT_DATE + INTERVAL 25 DAY, NULL, 'Одобрението е отказано до уточняване на спецификацията.', 'Изискано е алтернативно решение.', 'High', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'On Hold', 'Shenzhen Motion Controls', 308, 'Q-STG-2026-005', 405, 1250.00, 1250.00, 1250.00, 'maria.georgieva', NOW() - INTERVAL 17 DAY, 1002, NOW() - INTERVAL 17 DAY, NOW() - INTERVAL 1 DAY, 'Нужна е техническа спецификация.', NULL, NULL, 'rejected', NULL, NULL, 1, 'pending'),
    (1013, 'SOF1', 201, 'Тефлонов маркуч 8 mm', 'PTFE-8-WH', 'Пневматика', 25, CURRENT_DATE + INTERVAL 30 DAY, NULL, 'Стандартна складова наличност.', NULL, 'Low', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'New', NULL, NULL, NULL, NULL, 0.00, 0.00, 0.00, NULL, NOW() - INTERVAL 1 DAY, NULL, NULL, NOW() - INTERVAL 1 DAY, NULL, NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1014, 'PDV1', 204, 'Предпазен фотоелектричен датчик', 'SICK-WTB4', 'Сензори', 2, CURRENT_DATE + INTERVAL 13 DAY, NULL, 'Изчаква се потвърждение за монтажния размер.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Pending', NULL, NULL, NULL, NULL, 0.00, 0.00, 0.00, 'maria.georgieva', NOW() - INTERVAL 3 DAY, 1002, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 1 DAY, 'Проверка на техническия чертеж.', NULL, NULL, 'not_required', NULL, NULL, 1, 'in_progress'),
    (1015, 'VAR1', 206, 'Защитни ръкавици нитрил размер L', 'HSE-NIT-L', 'Безопасност', 50, CURRENT_DATE + INTERVAL 7 DAY, NULL, 'Попълване на склад за ЛПС.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Quote Requested', 'Festo SE & Co. KG', 302, 'Q-STG-2026-001', 401, 0.00, 0.00, 0.00, 'maria.georgieva', NOW() - INTERVAL 4 DAY, 1002, NOW() - INTERVAL 4 DAY, NOW() - INTERVAL 8 HOUR, 'RFQ включва доставка до Варна.', NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1016, 'SOF2', 203, 'Пневматичен фитинг Y G1/8', 'QS-Y-G18', 'Пневматика', 30, CURRENT_DATE + INTERVAL 11 DAY, CURRENT_DATE + INTERVAL 9 DAY, 'Получена оферта; сравнява се с алтернатива.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Quote Received', 'Пневматика България ООД', 301, 'Q-STG-2026-002', 402, 650.00, 21.67, 650.10, 'maria.georgieva', NOW() - INTERVAL 7 DAY, 1002, NOW() - INTERVAL 7 DAY, NOW() - INTERVAL 3 HOUR, 'Чака потвърждение на количеството.', NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required'),
    (1017, 'SOF1', 201, 'Ремък клинов SPA 1250', 'SPA-1250', 'Задвижване', 6, CURRENT_DATE + INTERVAL 21 DAY, CURRENT_DATE + INTERVAL 16 DAY, 'Одобрена алтернатива от Schaeffler Romania.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Approved', 'Schaeffler Romania SRL', 305, NULL, NULL, 420.00, 70.00, 420.00, 'maria.georgieva', NOW() - INTERVAL 8 DAY, 1002, NOW() - INTERVAL 8 DAY, NOW() - INTERVAL 5 HOUR, 'Готово за PO след потвърждение на адрес.', NULL, NULL, 'approved', 1004, NOW() - INTERVAL 2 DAY, 0, 'not_required'),
    (1018, 'SOF2', 203, 'Сачмен лагер 6206-2RS', 'SKF-6206-2RS', 'Лагери', 10, CURRENT_DATE + INTERVAL 9 DAY, CURRENT_DATE + INTERVAL 7 DAY, 'Включен в потвърдена PO.', NULL, 'High', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Ordered', 'SKF Sverige AB', 303, 'Q-STG-2026-004', 404, 900.00, 90.00, 900.00, 'maria.georgieva', NOW() - INTERVAL 9 DAY, 1002, NOW() - INTERVAL 9 DAY, NOW() - INTERVAL 12 HOUR, 'Доставчикът потвърди наличност.', 501, 'PO-STG-2026-001', 'approved', 1004, NOW() - INTERVAL 2 DAY, 0, 'not_required'),
    (1019, 'SOF2', 203, 'Пневматичен регулатор на налягане', 'LR-1-4-D-MINI', 'Пневматика', 2, CURRENT_DATE - INTERVAL 9 DAY, CURRENT_DATE - INTERVAL 7 DAY, 'Доставка приключена и фактурата е получена.', NULL, 'Normal', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Delivered', 'Пневматика България ООД', 301, 'Q-STG-2026-002', 402, 530.00, 265.00, 530.00, 'maria.georgieva', NOW() - INTERVAL 21 DAY, 1002, NOW() - INTERVAL 21 DAY, NOW() - INTERVAL 5 DAY, 'Фактурата е изпратена към счетоводство.', 504, 'PO-STG-2026-004', 'not_required', NULL, NULL, 0, 'not_required'),
    (1020, 'VAR1', 205, 'Механичен шарнир за сервизна стойка', 'TRK-JNT-440', 'Механика', 2, CURRENT_DATE + INTERVAL 26 DAY, NULL, 'Очаква се техническа консултация от Турция.', NULL, 'Low', 1003, 'Николай Димов', 'nikolay.dimov@staging.partpulse.invalid', 'Pending', 'Teknorot Otomotiv', 307, 'Q-STG-2026-005', 405, 0.00, 0.00, 0.00, 'maria.georgieva', NOW() - INTERVAL 3 DAY, 1002, NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 6 HOUR, 'Изчаква се транспортна оценка.', NULL, NULL, 'not_required', NULL, NULL, 0, 'not_required');

INSERT INTO quote_items (id, quote_id, order_id, unit_price, quantity, total_price, notes) VALUES
    (411, 401, 1003, 0.00, 3, 0.00, 'Изчаква се отговор от доставчика.'),
    (412, 401, 1015, 0.00, 50, 0.00, 'Изчаква се отговор от доставчика.'),
    (413, 402, 1004, 320.00, 2, 640.00, 'Оферта за цилиндри.'),
    (414, 402, 1016, 21.67, 30, 650.10, 'Оферта за фитинги.'),
    (415, 402, 1008, 38.00, 20, 760.00, 'Потвърдена PO.'),
    (416, 402, 1019, 265.00, 2, 530.00, 'Доставено и фактурирано.'),
    (417, 403, 1005, 980.00, 1, 980.00, 'Чака управленско одобрение.'),
    (418, 404, 1006, 450.00, 2, 900.00, 'Одобрени лагери.'),
    (419, 404, 1007, 45.83, 12, 549.96, 'Одобрени резервни лагери.'),
    (420, 404, 1009, 90.00, 4, 360.00, 'Частична доставка.'),
    (421, 404, 1010, 270.00, 2, 540.00, 'Доставено.'),
    (422, 404, 1018, 90.00, 10, 900.00, 'Потвърдена PO.');

INSERT INTO documents
    (id, order_id, document_type, file_path, file_name, file_size, mime_type, uploaded_by,
     metadata, requires_action, action_deadline, action_notes, status, processed_at, processed_by,
     notes, description)
VALUES
    (601, 1004, 'quote_pdf', '/var/www/partpulse-orders/backend/uploads/staging/q-stg-2026-002.pdf', 'Q-STG-2026-002.pdf', 182400, 'application/pdf', 1002, JSON_OBJECT('quote_number', 'Q-STG-2026-002', 'supplier', 'Пневматика България ООД'), 0, NULL, NULL, 'processed', NOW() - INTERVAL 5 DAY, 1002, 'Получена оферта.', 'Оферта за пневматични цилиндри и фитинги.'),
    (602, 1010, 'invoice', '/var/www/partpulse-orders/backend/uploads/staging/inv-skf-2026-104.pdf', 'INV-SKF-2026-104.pdf', 211700, 'application/pdf', 1002, JSON_OBJECT('invoice_number', 'SKF-2026-104', 'amount_total', 648.00, 'currency', 'EUR'), 0, NULL, NULL, 'sent_to_accounting', NOW() - INTERVAL 3 DAY, 1005, 'Изпратена към счетоводство.', 'Фактура за доставени лагери.'),
    (603, 1010, 'delivery_note', '/var/www/partpulse-orders/backend/uploads/staging/dn-skf-2026-104.pdf', 'DN-SKF-2026-104.pdf', 126300, 'application/pdf', 1002, JSON_OBJECT('delivery_date', DATE_FORMAT(CURRENT_DATE - INTERVAL 8 DAY, '%Y-%m-%d')), 0, NULL, NULL, 'processed', NOW() - INTERVAL 7 DAY, 1002, 'Подписан приемо-предавателен протокол.', 'Доказателство за доставка.'),
    (604, 1007, 'purchase_order', '/var/www/partpulse-orders/backend/uploads/staging/po-stg-2026-001.pdf', 'PO-STG-2026-001.pdf', 146500, 'application/pdf', 1002, JSON_OBJECT('po_number', 'PO-STG-2026-001', 'supplier', 'SKF Sverige AB'), 0, NULL, NULL, 'processed', NOW() - INTERVAL 8 DAY, 1002, 'Изпратена PO.', 'Поръчка към SKF.'),
    (605, 1003, 'quote_request', '/var/www/partpulse-orders/backend/uploads/staging/rfq-stg-2026-001.pdf', 'RFQ-STG-2026-001.pdf', 95400, 'application/pdf', 1002, JSON_OBJECT('quote_number', 'Q-STG-2026-001', 'supplier', 'Festo SE & Co. KG'), 1, CURRENT_DATE + INTERVAL 3 DAY, 'Проследете отговора на доставчика.', 'pending', NULL, NULL, 'RFQ изчаква отговор.', 'Запитване за оферта.'),
    (606, 1012, 'proforma_invoice', '/var/www/partpulse-orders/backend/uploads/staging/proforma-smc-2026-011.pdf', 'PROFORMA-SMC-2026-011.pdf', 173500, 'application/pdf', 1002, JSON_OBJECT('supplier', 'Shenzhen Motion Controls', 'currency', 'EUR'), 1, CURRENT_DATE + INTERVAL 5 DAY, 'Изисква техническа проверка.', 'pending', NULL, NULL, 'Изчаква се техническа проверка.', 'Проформа за PLC модул.'),
    (607, 1008, 'customs_declaration', '/var/www/partpulse-orders/backend/uploads/staging/customs-demo-2026-004.pdf', 'CUSTOMS-DEMO-2026-004.pdf', 88200, 'application/pdf', 1002, JSON_OBJECT('reference', 'STAGING-DEMO-ONLY'), 0, NULL, NULL, 'processed', NOW() - INTERVAL 1 DAY, 1002, 'Демонстрационен митнически документ.', 'Тестов документ за документооборот.'),
    (608, 1019, 'invoice', '/var/www/partpulse-orders/backend/uploads/staging/inv-pneumatika-2026-88.pdf', 'INV-PNEUMATIKA-2026-88.pdf', 198600, 'application/pdf', 1002, JSON_OBJECT('invoice_number', 'PB-2026-88', 'amount_total', 636.00, 'currency', 'BGN'), 0, NULL, NULL, 'sent_to_accounting', NOW() - INTERVAL 4 DAY, 1005, 'Фактура за регулатори.', 'Фактура за доставени пневматични регулатори.');

INSERT INTO quote_responses
    (id, quote_id, quote_item_id, order_id, recorded_by, unit_price, total_price, currency,
     promised_delivery_date, lead_time_days, availability, moq, has_alternative,
     alternative_description, alternative_unit_price, supplier_notes, internal_notes,
     response_document_id, status)
VALUES
    (431, 402, 413, 1004, 1002, 320.0000, 640.0000, 'BGN', CURRENT_DATE + INTERVAL 6 DAY, 5, 'in_stock', 1, 0, NULL, NULL, 'Включена доставка.', 'Офертата е конкурентна.', 601, 'accepted'),
    (432, 402, 414, 1016, 1002, 21.6700, 650.1000, 'BGN', CURRENT_DATE + INTERVAL 9 DAY, 7, 'available', 10, 1, 'Алтернативен фитинг от месинг.', 19.5000, 'Възможен е частичен складов наличност.', 'Чака потвърждение на количеството.', 601, 'negotiating'),
    (433, 404, 419, 1007, 1002, 45.8300, 549.9600, 'EUR', CURRENT_DATE + INTERVAL 7 DAY, 6, 'available', 1, 0, NULL, NULL, 'Потвърдено от SKF.', 'Включено в PO.', 604, 'accepted');

INSERT INTO po_items
    (id, po_id, order_id, quote_item_id, item_description, part_number, quantity,
     unit_price, total_price, currency, received_quantity, status, notes)
VALUES
    (511, 501, 1007, 419, 'Сачмен лагер 6205-2RS', 'SKF-6205-2RS', 12, 45.8300, 549.9600, 'EUR', 0, 'pending', 'Очаква се доставка.'),
    (512, 501, 1018, 422, 'Сачмен лагер 6206-2RS', 'SKF-6206-2RS', 10, 90.0000, 900.0000, 'EUR', 0, 'pending', 'Очаква се доставка.'),
    (513, 502, 1008, 415, 'Бърза връзка за въздух G1/4', 'QS-G1-4', 20, 38.0000, 760.0000, 'BGN', 0, 'pending', 'В транспорт.'),
    (514, 503, 1009, 420, 'Концентрична втулка за лагерен възел', 'SKF-H312', 4, 90.0000, 360.0000, 'EUR', 2, 'partial', 'Половината от количеството е получено.'),
    (515, 503, 1010, 421, 'Радиален лагер 6308', 'SKF-6308-2RS', 2, 270.0000, 540.0000, 'EUR', 2, 'received', 'Доставено и прието.'),
    (516, 504, 1019, 416, 'Пневматичен регулатор на налягане', 'LR-1-4-D-MINI', 2, 265.0000, 530.0000, 'BGN', 2, 'received', 'Доставено и фактурирано.');

INSERT INTO invoices
    (id, invoice_number, po_id, quote_id, supplier_id, received_by, invoice_date, due_date,
     currency, amount, vat_amount, total_amount, status, sent_to_accounting_at,
     sent_to_accounting_by, accounting_notes, booking_reference, paid_at, document_id, notes)
VALUES
    (901, 'SKF-2026-104', 503, 404, 303, 1002, CURRENT_DATE - INTERVAL 9 DAY, CURRENT_DATE + INTERVAL 21 DAY, 'EUR', 540.00, 108.00, 648.00, 'sent_to_accounting', NOW() - INTERVAL 3 DAY, 1002, 'Очаква осчетоводяване.', 'STG-ACC-104', NULL, 602, 'Фактура за доставен лагер 6308.'),
    (902, 'PB-2026-88', 504, 402, 301, 1002, CURRENT_DATE - INTERVAL 7 DAY, CURRENT_DATE + INTERVAL 8 DAY, 'BGN', 530.00, 106.00, 636.00, 'booked', NOW() - INTERVAL 4 DAY, 1002, 'Осчетоводена в тестовата среда.', 'STG-ACC-088', NULL, 608, 'Фактура за регулатори.'),
    (903, 'SKF-2026-093', 503, 404, 303, 1002, CURRENT_DATE - INTERVAL 15 DAY, CURRENT_DATE - INTERVAL 1 DAY, 'EUR', 360.00, 72.00, 432.00, 'paid', NOW() - INTERVAL 13 DAY, 1002, 'Тестово платена частична доставка.', 'STG-ACC-093', NOW() - INTERVAL 1 DAY, 602, 'Частична доставка на втулки.');

UPDATE orders SET invoice_id = 901 WHERE id = 1010;
UPDATE orders SET invoice_id = 902 WHERE id = 1019;
UPDATE orders SET invoice_id = 903 WHERE id = 1009;

INSERT INTO invoice_metadata
    (id, document_id, invoice_number, invoice_date, due_date, amount_net, amount_vat,
     amount_total, currency, supplier_name, payment_terms, payment_status, paid_at, paid_by,
     payment_slip_doc_id, notes)
VALUES
    (911, 602, 'SKF-2026-104', CURRENT_DATE - INTERVAL 9 DAY, CURRENT_DATE + INTERVAL 21 DAY, 540.00, 108.00, 648.00, 'EUR', 'SKF Sverige AB', 'Net 30', 'unpaid', NULL, NULL, NULL, 'Подготвена за счетоводен преглед.'),
    (912, 608, 'PB-2026-88', CURRENT_DATE - INTERVAL 7 DAY, CURRENT_DATE + INTERVAL 8 DAY, 530.00, 106.00, 636.00, 'BGN', 'Пневматика България ООД', 'Net 15', 'paid', NOW() - INTERVAL 1 DAY, 1005, NULL, 'Тестово платена фактура.');

INSERT INTO payment_reminder_config (id, days_before, active) VALUES
    (921, 3, 1),
    (922, 7, 1);

INSERT INTO payment_reminders (id, invoice_meta_id, remind_days_before, last_sent_at, active) VALUES
    (931, 911, 3, NULL, 1),
    (932, 912, 7, NOW() - INTERVAL 2 DAY, 1);

INSERT INTO approvals
    (id, order_id, quote_document_id, requested_by, assigned_to, status, approved_by,
     approved_at, comments, rejection_reason, estimated_cost, supplier_id, priority)
VALUES
    (701, 1005, 601, 1002, 1004, 'pending', NULL, NULL, 'Моля за одобрение на комплект динамометрични ключове.', NULL, 980.00, 304, 'High'),
    (702, 1012, 606, 1002, 1004, 'rejected', 1004, NOW() - INTERVAL 2 DAY, 'Изискана е допълнителна техническа спецификация.', 'Липсва потвърдена спецификация за PLC модула.', 1250.00, 308, 'High');

INSERT INTO approval_history
    (id, approval_id, action, performed_by, old_status, new_status, comments, metadata)
VALUES
    (711, 701, 'created', 1002, NULL, 'pending', 'Одобрението е изпратено.', JSON_OBJECT('source', 'seed-test-data')),
    (712, 702, 'created', 1002, NULL, 'pending', 'Искане за одобрение.', JSON_OBJECT('source', 'seed-test-data')),
    (713, 702, 'rejected', 1004, 'pending', 'rejected', 'Нужна е техническа спецификация.', JSON_OBJECT('source', 'seed-test-data'));

INSERT INTO quote_send_log (id, quote_id, sent_by, sent_at, method, supplier_email, notes) VALUES
    (441, 401, 1002, NOW() - INTERVAL 4 DAY, 'outlook', 'sales@festo.example', 'RFQ изпратено от Outlook.'),
    (442, 402, 1002, NOW() - INTERVAL 7 DAY, 'copy', 'sales@pneumatika-bg.example', 'Офертата е получена и записана.');

INSERT INTO communications
    (id, order_id, direction, communication_type, subject, body, from_email, to_email,
     sent_by, has_attachments, attachment_count, notes)
VALUES
    (451, 1003, 'outgoing', 'quote_request', 'RFQ Q-STG-2026-001', 'Моля, изпратете оферта за посочените пневматични компоненти.', 'maria.georgieva@staging.partpulse.invalid', 'sales@festo.example', 1002, 1, 1, 'Тестова RFQ комуникация.'),
    (452, 1004, 'incoming', 'quote_received', 'Оферта Q-STG-2026-002', 'Изпращаме нашата оферта за цилиндри и фитинги.', 'sales@pneumatika-bg.example', 'maria.georgieva@staging.partpulse.invalid', 1002, 1, 1, 'Получена оферта.'),
    (453, 1010, 'incoming', 'invoice_received', 'Фактура SKF-2026-104', 'Приложена е фактурата за доставените лагери.', 'orders@skf.example', 'maria.georgieva@staging.partpulse.invalid', 1002, 1, 1, 'Изпратена към счетоводство.');

INSERT INTO order_history (id, order_id, changed_by, field_name, old_value, new_value) VALUES
    (461, 1003, 'Мария Георгиева', 'status', 'Pending', 'Quote Requested'),
    (462, 1004, 'Мария Георгиева', 'status', 'Quote Requested', 'Quote Received'),
    (463, 1005, 'Мария Георгиева', 'status', 'Quote Received', 'Quote Under Approval'),
    (464, 1010, 'Мария Георгиева', 'status', 'In Transit', 'Delivered'),
    (465, 1011, 'Николай Димов', 'status', 'Pending', 'Cancelled'),
    (466, 1012, 'Елена Стоянова', 'status', 'Quote Under Approval', 'On Hold');

INSERT INTO orders_audit_log (id, order_id, field_name, old_value, new_value, changed_by, reason) VALUES
    (471, 1008, 'status', 'Ordered', 'In Transit', 1002, 'PO изпратена към доставчика.'),
    (472, 1009, 'status', 'In Transit', 'Partially Delivered', 1002, 'Получени са два от четири броя.'),
    (473, 1010, 'status', 'In Transit', 'Delivered', 1002, 'Доставката е потвърдена.');

INSERT INTO order_assignment_history
    (id, order_id, assigned_from_user_id, assigned_to_user_id, assigned_by_user_id, assignment_type, reason)
VALUES
    (481, 1002, NULL, 1002, 1002, 'claim', 'Поето за техническо уточнение.'),
    (482, 1005, NULL, 1002, 1001, 'reassign', 'Възложено за обработка на оферта.'),
    (483, 1012, 1002, NULL, 1002, 'release', 'Изчаква техническа спецификация.');

INSERT INTO order_documents_link (id, order_id, document_id, linked_by) VALUES
    (491, 1004, 601, 1002),
    (492, 1016, 601, 1002),
    (493, 1010, 602, 1002),
    (494, 1010, 603, 1002),
    (495, 1007, 604, 1002),
    (496, 1003, 605, 1002),
    (497, 1012, 606, 1002),
    (498, 1019, 608, 1002);

INSERT INTO order_files (id, order_id, file_name, file_path, file_type, file_size) VALUES
    (501, 1014, 'sensor-mounting-sketch.pdf', '/var/www/partpulse-orders/backend/uploads/staging/sensor-mounting-sketch.pdf', 'application/pdf', 78400);

INSERT INTO eu_deliveries
    (id, order_id, supplier_id, supplier_country, delivery_date, delivery_confirmed_by,
     delivery_confirmed_at, intrastat_deadline, intrastat_declared, intrastat_declared_date,
     intrastat_declared_by, delivery_note_signed, delivery_note_returned_date,
     invoice_number, invoice_amount, invoice_currency, notes)
VALUES
    (521, 1010, 303, 'SE', CURRENT_DATE - INTERVAL 8 DAY, 1002, NOW() - INTERVAL 8 DAY,
     CURRENT_DATE + INTERVAL 6 DAY, 0, NULL, NULL, 1, CURRENT_DATE - INTERVAL 7 DAY,
     'SKF-2026-104', 648.00, 'EUR', 'Тестова Intrastat доставка от Швеция.'),
    (522, 1009, 303, 'SE', CURRENT_DATE - INTERVAL 5 DAY, 1002, NOW() - INTERVAL 5 DAY,
     CURRENT_DATE + INTERVAL 9 DAY, 0, NULL, NULL, 1, CURRENT_DATE - INTERVAL 4 DAY,
     'SKF-2026-093', 432.00, 'EUR', 'Частична EU доставка.');

INSERT INTO supplier_item_history
    (id, order_id, supplier_id, item_description, part_number, category, keywords, match_quality)
VALUES
    (531, 1007, 303, 'Сачмен лагер 6205-2RS', 'SKF-6205-2RS', 'Лагери', 'лагер SKF 6205 компресор', 'exact'),
    (532, 1016, 301, 'Пневматичен фитинг Y G1/8', 'QS-Y-G18', 'Пневматика', 'фитинг пневматика G1/8', 'good'),
    (533, 1017, 305, 'Ремък клинов SPA 1250', 'SPA-1250', 'Задвижване', 'ремък SPA 1250 задвижване', 'exact');

INSERT INTO supplier_selection_log
    (id, order_id, supplier_id, selected_by_user_id, from_suggestion, suggestion_rank)
VALUES
    (541, 1007, 303, 1002, 1, 1),
    (542, 1016, 301, 1002, 1, 1),
    (543, 1017, 305, 1002, 0, NULL);

INSERT INTO product_aliases
    (id, raw_name, canonical_name, part_number, category, supplier_id, source, created_by)
VALUES
    (551, 'лагер 6205', 'Сачмен лагер 6205-2RS', 'SKF-6205-2RS', 'Лагери', 303, 'manual', 1002),
    (552, 'въздушен фитинг G 1/8', 'Пневматичен фитинг Y G1/8', 'QS-Y-G18', 'Пневматика', 301, 'manual', 1002);

INSERT INTO training_orders
    (id, item_description, building, cost_center, supplier_id, source_file, source_sheet)
VALUES
    (561, 'Сачмен лагер 6205-2RS', 'SOF1', 'SOF1-MNT', 303, 'staging_seed.csv', 'orders'),
    (562, 'Пневматичен фитинг Y G1/8', 'SOF2', 'SOF2-PRD', 301, 'staging_seed.csv', 'orders');

INSERT INTO notification_log
    (id, order_id, channel, notification_type, recipient_id, recipient_email, recipient_name,
     subject, message_preview, status, old_status, new_status)
VALUES
    (571, 1005, 'email', 'approval', 1004, 'elena.stoyanova@staging.partpulse.invalid', 'Елена Стоянова', 'Одобрение за поръчка #1005', 'Изчаква се одобрение на оферта.', 'sent', 'Quote Received', 'Quote Under Approval'),
    (572, 1010, 'email', 'status-update', 1003, 'nikolay.dimov@staging.partpulse.invalid', 'Николай Димов', 'Поръчка #1010 е доставена', 'Доставката е потвърдена.', 'sent', 'In Transit', 'Delivered');

INSERT INTO accounting_handovers
    (id, sent_by, sent_at, notes, zip_file_path, zip_file_name, email_sent, email_sent_at,
     recipient_ids, status, acknowledged_by, acknowledged_at)
VALUES
    (801, 1002, NOW() - INTERVAL 3 DAY, 'Тестово предаване на две фактури.', '/var/www/partpulse-orders/backend/uploads/accounting/staging-handover-801.zip', 'staging-handover-801.zip', 1, NOW() - INTERVAL 3 DAY, JSON_ARRAY(1005), 'acknowledged', 1005, NOW() - INTERVAL 2 DAY);

INSERT INTO accounting_handover_documents (id, handover_id, document_id) VALUES
    (811, 801, 602),
    (812, 801, 608);

INSERT INTO accounting_audit_log
    (id, event_type, handover_id, document_id, invoice_meta_id, order_id, actor_id,
     actor_name, description, meta)
VALUES
    (821, 'handover_sent', 801, 602, 911, 1010, 1002, 'Мария Георгиева', 'Фактурата е изпратена към счетоводство.', JSON_OBJECT('recipient_ids', JSON_ARRAY(1005))),
    (822, 'invoice_paid', NULL, 608, 912, 1019, 1005, 'Борислав Илиев', 'Тестово отбелязана платена фактура.', JSON_OBJECT('payment_status', 'paid'));

COMMIT;

SELECT
    (SELECT COUNT(*) FROM users WHERE id BETWEEN 1001 AND 1005) AS seeded_users,
    (SELECT COUNT(*) FROM suppliers WHERE id BETWEEN 301 AND 308) AS seeded_suppliers,
    (SELECT COUNT(*) FROM orders WHERE id BETWEEN 1001 AND 1020) AS seeded_orders,
    (SELECT COUNT(DISTINCT status) FROM orders WHERE id BETWEEN 1001 AND 1020) AS distinct_order_statuses,
    (SELECT COUNT(*) FROM invoice_metadata WHERE id BETWEEN 911 AND 912) AS seeded_invoice_metadata;


-- Spread the seeded orders across both requesters so that role scoping is
-- exercised: each requester must see only their own orders, and the two sets
-- must not overlap.
UPDATE orders
SET requester_id = 1006,
    requester_name = 'Петър Иванов',
    requester_email = 'petar.ivanov@staging.partpulse.invalid'
WHERE id IN (SELECT id FROM (SELECT id FROM orders ORDER BY id LIMIT 8) AS pick);

SELECT
    (SELECT COUNT(*) FROM orders WHERE requester_id = 1003) AS orders_requester_one,
    (SELECT COUNT(*) FROM orders WHERE requester_id = 1006) AS orders_requester_two;
