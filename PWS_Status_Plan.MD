# PWS statusa plāns

## Kopsavilkums par paveikto
- UI pamats: Dashboard, Orders saraksts, Order detaļas, Settings, tēmas pārslēgšana, navigācija.
- Orders saraksta uzlabojumi:
  - Meklēšana, statusa filtri, grupēšana pēc līguma, skaiti, importa veidne + Excel importa plūsma.
  - Responsīva tabula ar izvēles hierarhijas kolonnām, kas uz mazākiem ekrāniem tiek paslēptas, un horizontālo scroll.
  - Kebab izvēlnes darbībām, fiksēta pozicionēšana.
  - Engineer kolonna ar iniciāļu avataru.
- Order detaļu lapa:
  - Pielikumi (drag-and-drop, preview, izmēra limits, Supabase augšupielāde).
  - Komentāri ar autoru un lomu.
  - Statusa badge + lomu darbības.
  - Inženiera piešķiršana (manuāla + “take order”).
  - Statusu vēstures timeline.
- Statusu plūsma (jauna):
  - draft → ready_for_engineering → in_engineering → ready_for_production.
  - pieejams stāvoklis engineering_blocked.
  - lomu skati (Sales/Engineering/Production/Admin) Orders sarakstā.
- Darbplūsmas noteikumi:
  - Checklist vienumi (konfigurējami Settings).
  - Obligātie pielikumi + obligāts komentārs pirms statusa maiņas.
  - Atgriešanas iemeslu saraksts (tagad DB).
- Audits:
  - statusChangedBy / statusChangedAt glabājas orders.
  - order_status_history tabula pilnai vēsturei.
- Settings:
  - Hierarhijas līmeņi + reference saraksti.
  - Darba stacijas, operatori, stop reasons.
  - User Access ar lomu pārvaldību + dev override slēdzi.
  - Workflow Rules sadaļa (checklists + return reasons).
- Auth + lomas:
  - Supabase auth (magic link).
  - Profiles tabula lomām un tenant.
- Fake Horizon accounting API + sync uz Orders (read-only avots, bet lokālas izmaiņas atļautas).

## DB izmaiņas (esamība / nepieciešamība)
- orders:
  - checklist jsonb
  - assigned_engineer_id, assigned_engineer_name, assigned_engineer_at
  - status_changed_by, status_changed_by_role, status_changed_at
- order_status_history tabula
- return_reasons tabula
- RLS politikas tenant-scope piekļuvei jaunajās tabulās

## Statusu plūsmas politika (šobrīd)
- Sales var sūtīt Draft → Ready for Engineering.
- Engineering var Start → In Engineering, Block, vai Ready for Production.
- Atgriešana:
  - Sales var atgriezt no Engineering uz Draft.
  - Engineering var atgriezt no Production uz In Engineering.
- Statusa nosacījumi:
  - Checklist vienumi + minimālais pielikumu skaits + obligāts komentārs (konfigurējams Settings).

## Kas vēl jāizdara (nākamie soļi)
1) Pārliecināties, ka DB politikas atbilst tenant modelim (RLS uz order_status_history, return_reasons, orders.checklist).
2) Statusu vēstures ieraksts katrā statusa maiņā visos avotos (arī bulk update).
3) Checklist/return rules glabāt DB pa tenant (nevis localStorage).
4) Piešķiršanas noteikumi:
   - Sales/Admin var piešķirt inženieri no lietotāju saraksta.
   - Self-assign tikai Engineering lomai (pēc izvēles).
5) “Status change rules” UI Settings sadaļā (kurš var pārvietot no kura uz kuru statusu + required items).
6) Production modulis:
   - Batch izveide no Ready for Production.
   - Staciju skati ar start/stop/complete + stop reasons.
   - Laika uzskaite pa stacijām.
7) Atļaujas:
   - Sales redz visus pasūtījumus un statusus.
   - Engineering redz engineering un production rindu (kā tagad).
   - Production redz tikai production rindu.
8) Activity log pasūtījumam (faili/komentāri/statusu maiņas) auditam.
9) API integrācijas “stub” grāmatvedībai (Horizon) + konfliktu sinhronizācijas stratēģija.
10) UI noslīpēšana:
    - Timeline ikonas, badge, statusu krāsas tumšajā tēmā.
    - Empty states un “helper” norādes checklista noteikumiem.

## Piezīmes
- Sistēma ir multi-tenant; visām datu operācijām jābūt tenant-scope.
- Lietotāji nedrīkst redzēt citu uzņēmumu datus.
- Excel/CSV imports paredzēts sākotnējai ielādei; ikdienas sinhronizācijai jābūt no grāmatvedības integrācijas.
