# Lejek Leadów Klientów

## Streszczenie
**Kluczowe punkty:**
- Dodanie pierwszorzędnej funkcjonalności `lead` wewnątrz istniejącego modułu `customers` jako odrębnego obszaru CRM z własną listą, stroną szczegółową, potokami (pipelines), przepływem kwalifikacji, przepływem konwersji, analityką i wsparciem dla automatyzacji.
- `Lead` to dedykowany obiekt wstępny, a nie zwykłe `customer_entity.lifecycleStage = lead`. Jego zadaniem jest zapobieganie przedwczesnemu zanieczyszczeniu kanonicznych rekordów CRM przez spam, boty i ruch niskiej jakości.
- Lead ma własny identyfikator (ID), ładunek źródłowy (source payload), historię, stan sprawdzania duplikatów oraz jawne powiązania rodowodowe z rekordami `person`, `company` i `deal` tworzonymi lub łączonymi podczas kwalifikacji i konwersji.
- Leady obsługują wiele konfigurowalnych potoków (pipelines) od wersji v1.
- Część pól leada jest wyłącznie leadowa, natomiast część to współdzielone widoki pól należących do obiektów niższego poziomu (`company`, `person`, `deal`). Pola współdzielone muszą wstępnie wypełniać tworzone rekordy i pozostawać zsynchronizowane po powiązaniu/konwersji.

**Zakres:**
- Nowy model domenowy leadów, API, ACL, zdarzenia, wyszukiwanie i domyślna konfiguracja w module `customers`
- Dedykowana lista leadów, widok szczegółowy leada i tablica potoku w backendzie
- Konfigurowalny model wielu potoków z etapami i powodami utraty
- Przepływ konwersji do tworzenia lub łączenia obiektów `person`, `company`, `deal` lub ich kombinacji
- Wykrywanie duplikatów w istniejących `people` / `companies` na podstawie e-maila, telefonu i NIP
- Przechowywanie surowego ładunku przychodzącego (raw inbound payload) na potrzeby audytu, analityki i przyszłego remapowania
- Ręczne tworzenie/łączenie osoby/firmy przed ostatecznym zamknięciem leada
- Wsparcie dla dashboardu, raportowania, wyszukiwania i automatyzacji

**Zastrzeżenia:**
- Pola współdzielone nie mogą tworzyć drugiego konkurencyjnego źródła prawdy po powiązaniu/konwersji.
- Konwersja i ręczne łączenie muszą zachowywać rodowód bez naruszania istniejących kontraktów `customers` / `deals`.
- Projekt potoków i etapów musi być gotowy na przyszłość bez nadmiernego komplikowania kształtu MVP.

## Przegląd
Niniejsza specyfikacja wprowadza dedykowany lejek leadów wewnątrz domeny CRM `customers`. Leady reprezentują przychodzące sygnały handlowe, które nie są jeszcze kanonicznymi rekordami CRM. Mogą pochodzić z formularzy, pozyskiwania przez API, synchronizacji z zewnętrznymi CRM, kampanii reklamowych i podobnych źródeł, gdzie jakość danych jest niepewna, a spam lub duplikaty są częste.

Zamiast natychmiastowego tworzenia obiektów `person`, `company` lub `deal`, system przechowuje sygnał jako `lead`, kieruje go przez konfigurowalny potok kwalifikacji i dopiero wtedy umożliwia operatorom tworzenie lub łączenie obiektów CRM niższego poziomu.

Obszar leadów żyje wewnątrz `customers`, o podobnej wadze produktowej jak `deals`, lecz z innym celem:
- `leads`: przyjmowanie, selekcja (triage), kwalifikacja, bufor antyspamowy, proweniencja, analityka źródeł
- `people` / `companies`: kanoniczne rekordy CRM
- `deals`: szanse handlowe

> **Odwołanie do rynku**: Najbliższym modelem referencyjnym jest dedykowany obiekt lead obecny w Salesforce, HubSpot i OroCRM. Open Mercato powinien przyjąć dedykowany obiekt pre-CRM i jawny rodowód konwersji, zachowując jednocześnie implementację zgodną z istniejącymi wzorcami CRUD, komend, zdarzeń, słowników i UI modułu `customers`.

## Opis Problemu
Obecne prymitywy CRM są zoptymalizowane pod kanoniczne rekordy, nie pod hałaśliwy ruch przychodzący.

Stwarza to kilka problemów:
- Spam, boty i zgłoszenia niskiej jakości mogą zanieczyszczać `people` i `companies`.
- Zespoły nie mają ustrukturyzowanej przestrzeni do kwalifikacji przed tworzeniem rzeczywistych obiektów CRM.
- Atrybucja konwersji jest słaba, gdy rekord niższego poziomu pochodzi z pozyskiwania przychodzącego.
- Raportowanie jakości leadów, skuteczności źródeł, powodów utraty i konwersji lejka jest trudne.
- Istniejące pola `status`, `lifecycleStage` i `source` na encjach klientów nie modelują pełnego przepływu przyjmowania i konwersji leadów.
- Niektóre pola biznesowe konceptualnie należą do obiektów niższego poziomu, ale użytkownicy wciąż muszą je widzieć i edytować podczas procesu leadowania.

## Proponowane Rozwiązanie
Wprowadzenie dedykowanej domeny `customer_lead` wewnątrz `customers` z własnym magazynem, API, UI, pokryciem wyszukiwania, zdarzeniami i kontraktem konwersji.

### Zasady Główne
1. Lead jest pierwszorzędnym rekordem CRM z własnym ID i historią.
2. Lead może zawierać dane po stronie osoby, firmy, dealu i dane wyłącznie leadowe w jednej przestrzeni roboczej.
3. Leady są tworzone głównie ze źródeł zewnętrznych, ale obsługiwane jest też ręczne tworzenie.
4. Leady obsługują wiele konfigurowalnych potoków od wersji v1.
5. Wykrywanie duplikatów sprawdza istniejące dane CRM po e-mailu, telefonie i NIP, ostrzega operatora i wskazuje możliwe dopasowania bez blokowania tworzenia.
6. Operatorzy mogą ręcznie tworzyć i łączyć obiekty `person` / `company` podczas kwalifikacji przed ostatecznym zamknięciem leada.
7. Pomyślna konwersja leada pozwala wybrać, czy tworzyć nowe rekordy, czy łączyć z istniejącymi.
8. Utrata leada wymaga konfigurowalnego powodu utraty.
9. Surowy ładunek źródłowy i metadane pozyskiwania są przechowywane.
10. Lead pozostaje w systemie po konwersji jako rekord źródłowy na potrzeby analityki, atrybucji i audytu.
11. Część pól jest wyłącznie leadowa. Część jest współdzielona z `person`, `company` lub `deal` i musi zachowywać się jak udostępnione widoki kanonicznych pól niższego poziomu po istnieniu powiązania.

### Decyzje Projektowe
| Decyzja | Uzasadnienie |
|---------|--------------|
| Osobna encja `lead` zamiast `customer_entity.lifecycleStage = lead` | Zapobiega przedwczesnemu zanieczyszczeniu CRM i zachowuje rodowód pozyskiwania |
| Lead pozostaje po konwersji | Potrzebny do analityki, atrybucji i audytu |
| Obsługa wielu potoków w v1 | Jawne wymaganie użytkownika i unikanie natychmiastowego przeprojektowania |
| Wykrywanie duplikatów jest doradcze, nie blokujące | Pozyskiwanie sprzedażowe jest nieuporządkowane; fałszywe alarmy nie mogą blokować pracy |
| Zachowanie surowego ładunku źródłowego | Wspiera debugowanie, proweniencję, remapowanie i analitykę |
| Zezwolenie na ręczne tworzenie/łączenie przed zamknięciem | Odpowiada rzeczywistym przepływom kwalifikacji |
| Pola współdzielone są projekcjami pól posiadanych przez obiekty niższego poziomu po powiązaniu | Zapobiega podwójnemu źródłu prawdy, zachowując praktyczność UI leada |

### Rozważane Alternatywy
| Alternatywa | Dlaczego Odrzucona |
|-------------|-------------------|
| Użycie tylko `customer_entities` z `lifecycleStage = lead` | Zanieczyszcza kanoniczny CRM i osłabia rodowód konwersji |
| Automatyczne tworzenie `person` / `company` najpierw, potem kwalifikacja | Niweczy cel buforowania antyspamowego |
| Twarde blokowanie duplikatów | Zbyt rygorystyczne dla rzeczywistych operacji sprzedażowych |
| Kopiowanie pól współdzielonych jednorazowo przy konwersji bez późniejszej synchronizacji | Narusza wymaganie użytkownika i tworzy rozbieżności |

## Historyjki Użytkownika / Przypadki Użycia
- **Operacje sprzedażowe** chcą, aby ruch przychodzący trafiał do kolejki leadów, żeby spam nie zanieczyszczał CRM.
- **Przedstawiciel handlowy** chce przeglądać, przydzielać, kwalifikować, wzbogacać i konwertować lead na właściwe obiekty CRM.
- **Przedstawiciel handlowy** chce tworzyć lub łączyć osobę/firmę podczas kwalifikacji bez zamykania leada.
- **Menedżer** chce mierzyć przepustowość potoku, jakość źródeł, współczynnik konwersji i powody utraty.
- **Administrator** chce konfigurować potoki, etapy, powody utraty, pola niestandardowe i reguły ekspozycji pól współdzielonych bez zmian w kodzie.
- **Integrator** chce wysyłać leady do OM przez API/formularze i zachowywać pełną proweniencję źródłową.

## Architektura
Funkcjonalność leadów jest zaimplementowana wewnątrz `packages/core/src/modules/customers/` i stosuje istniejące wzorce `customers`:
- odwracalne komendy (undoable commands) dla mutacji
- `makeCrudRoute` + `openApi` dla tras CRUD/list
- wzorce słownik/konfiguracja dla wartości konfigurowalnych
- `DataTable` i `CrudForm` dla UI backendu
- zdarzenia/subskrybenci dla efektów ubocznych
- wyłącznie addytywny schemat

### Warstwy Domenowe
1. **Rdzeń Leadów**
   - `customer_leads`
   - walidatory leadów
   - komendy leadów
   - API CRUD/list/detail leadów
   - pokrycie wyszukiwania/indeksowania leadów
2. **Konfiguracja Leadów**
   - potoki leadów
   - etapy potoku
   - powody utraty
   - reguły ekspozycji pól współdzielonych
3. **Powiązanie i Konwersja Leadów**
   - powiązanie/tworzenie osoby
   - powiązanie/tworzenie firmy
   - konwersja do skonfigurowanego zestawu docelowego
   - trwały rodowód
4. **Analityka i Automatyzacja Leadów**
   - widżety dashboardu
   - wymiary raportowania
   - zdarzenia dla przepływów/subskrybentów

### Kanoniczny Model Własności
Specyfikacja wyróżnia trzy kategorie pól:

1. **Pola wyłącznie leadowe**
   - istnieją tylko w leadzie
   - nigdy nie synchronizują się z obiektami niższego poziomu
   - przykłady: surowe metadane źródłowe, notatki kwalifikacyjne, wynik spamu, ładunek kampanii

2. **Pola tylko do wstępnego wypełnienia (prefill-only)**
   - wprowadzane w leadzie
   - kopiowane do nowego obiektu niższego poziomu przy tworzeniu
   - po konwersji/powiązaniu nie są już synchronizowane

3. **Współdzielone pola udostępnione (shared surfaced fields)**
   - konceptualnie należą do obiektów niższego poziomu, np. `company`, `person` lub `deal`
   - wyświetlane w formularzu leada wewnątrz dedykowanych sekcji
   - po powiązaniu/utworzeniu obiektu niższego poziomu pole leada staje się projekcją/proxy do pola kanonicznego
   - zmiana w leadzie aktualizuje obiekt kanoniczny

Domyślna reguła:
- po istnieniu powiązania kanoniczny obiekt niższego poziomu jest właścicielem magazynowania
- strona leada może nadal edytować pole, ale ta mutacja przechodzi bezpośrednio do właściciela

### Komendy i Zdarzenia
**Komendy**
- `customers.lead.create`
- `customers.lead.update`
- `customers.lead.assign`
- `customers.lead.advance_stage`
- `customers.lead.mark_lost`
- `customers.lead.link_person`
- `customers.lead.link_company`
- `customers.lead.link_deal`
- `customers.lead.create_person`
- `customers.lead.create_company`
- `customers.lead.create_deal`
- `customers.lead.convert`
- `customers.lead.delete`

**Zdarzenia**
- `customers.lead.created`
- `customers.lead.updated`
- `customers.lead.assigned`
- `customers.lead.stage_changed`
- `customers.lead.lost`
- `customers.lead.person_linked`
- `customers.lead.company_linked`
- `customers.lead.deal_linked`
- `customers.lead.person_created`
- `customers.lead.company_created`
- `customers.lead.deal_created`
- `customers.lead.converted`

### Kontrakt Transakcji i Cofania (Undo)
- Mutacje lokalne leada są odwracalne przez standardową historię komend.
- Akcje powiązania/tworzenia to jawne komendy z migawkami przed/po.
- Konwersja to komenda złożona:
  - walidacja stanu leada
  - rozwiązanie duplikatów i wyborów docelowych
  - tworzenie/łączenie rekordów niższego poziomu
  - utrwalanie rodowodu
  - przejście wyniku leada
- Cofanie konwersji jest ograniczone przez efekty uboczne niższego poziomu:
  - wymagane jest odłączenie/przywrócenie metadanych leada
  - twarde usunięcie stworzonych rekordów niższego poziomu jest dozwolone tylko wtedy, gdy nie mają niezależnych modyfikacji po utworzeniu
  - gdy bezpieczne pełne cofnięcie jest niemożliwe, system musi zarejestrować częściową kompensację i przedstawić ją w historii audytu

## Modele Danych
### CustomerLead (Singularny)
Tabela: `customer_leads`

- `id`: UUID PK
- `organization_id`: UUID wymagany
- `tenant_id`: UUID wymagany
- `pipeline_id`: UUID wymagany
- `stage_id`: UUID wymagany
- `outcome`: tekst nullable (`open`, `won`, `lost`)
- `lost_reason_id`: UUID nullable
- `display_name`: tekst wymagany
- `owner_user_id`: UUID nullable
- `source`: tekst nullable
- `source_channel`: tekst nullable
- `source_external_id`: tekst nullable
- `source_payload_raw`: jsonb nullable
- `source_received_at`: timestamptz nullable
- `primary_email`: tekst nullable
- `primary_phone`: tekst nullable
- `vat_id`: tekst nullable
- `spam_score`: numeryczny nullable
- `qualification_notes`: tekst nullable
- `person_data`: jsonb nullable
- `company_data`: jsonb nullable
- `deal_data`: jsonb nullable
- `created_person_id`: UUID nullable
- `created_company_id`: UUID nullable
- `created_deal_id`: UUID nullable
- `linked_person_id`: UUID nullable
- `linked_company_id`: UUID nullable
- `linked_deal_id`: UUID nullable
- `converted_at`: timestamptz nullable
- `converted_by_user_id`: UUID nullable
- `created_at`: timestamptz wymagany
- `updated_at`: timestamptz wymagany
- `deleted_at`: timestamptz nullable

Indeksy:
- `(organization_id, tenant_id, pipeline_id, stage_id, created_at)`
- `(organization_id, tenant_id, outcome, created_at)`
- `(organization_id, tenant_id, primary_email)`
- `(organization_id, tenant_id, primary_phone)`
- `(organization_id, tenant_id, vat_id)`
- `(organization_id, tenant_id, source, source_channel)`

### CustomerLeadPipeline
Tabela: `customer_lead_pipelines`

- `id`: UUID PK
- `organization_id`: UUID wymagany
- `tenant_id`: UUID wymagany
- `name`: tekst wymagany
- `code`: tekst wymagany – stabilny identyfikator wewnętrzny
- `is_default`: boolean wymagany
- `is_active`: boolean wymagany
- `created_at`: timestamptz wymagany
- `updated_at`: timestamptz wymagany

### CustomerLeadPipelineStage
Tabela: `customer_lead_pipeline_stages`

- `id`: UUID PK
- `organization_id`: UUID wymagany
- `tenant_id`: UUID wymagany
- `pipeline_id`: UUID wymagany
- `name`: tekst wymagany
- `code`: tekst wymagany
- `position`: int wymagany
- `kind`: tekst wymagany (`open`, `won`, `lost`)
- `is_active`: boolean wymagany
- `created_at`: timestamptz wymagany
- `updated_at`: timestamptz wymagany

Reguły:
- dozwolonych jest wiele etapów `open`
- wymagany jest co najmniej jeden terminalny etap `won` / `lost` na potok
- etapy `won` wyzwalają przepływ konwersji, nie natychmiastową cichą konwersję

### CustomerLeadLostReason
Tabela: `customer_lead_lost_reasons`

- `id`: UUID PK
- `organization_id`: UUID wymagany
- `tenant_id`: UUID wymagany
- `pipeline_id`: UUID nullable
- `name`: tekst wymagany
- `code`: tekst wymagany
- `is_active`: boolean wymagany
- `sort_order`: int wymagany
- `created_at`: timestamptz wymagany
- `updated_at`: timestamptz wymagany

Reguły:
- powody mogą być globalne lub przypisane do potoku
- dodawanie/usuwanie/zmiana kolejności musi być konfigurowalna przez administratora

### CustomerLeadFieldBinding
Tabela: `customer_lead_field_bindings`

Cel:
- deklaruje, które widoczne w leadzie pola są wyłącznie leadowe, tylko do prefill lub współdzielonymi polami udostępnionymi
- definiuje właściciela docelowego obiektu i ścieżkę docelową

Pola:
- `id`: UUID PK
- `organization_id`: UUID wymagany
- `tenant_id`: UUID wymagany
- `pipeline_id`: UUID nullable
- `lead_field_key`: tekst wymagany
- `binding_mode`: tekst wymagany (`lead_only`, `prefill_only`, `shared`)
- `target_entity_kind`: tekst nullable (`person`, `company`, `deal`)
- `target_field_key`: tekst nullable
- `section_kind`: tekst wymagany (`lead`, `person`, `company`, `deal`)
- `is_active`: boolean wymagany
- `created_at`: timestamptz wymagany
- `updated_at`: timestamptz wymagany

Uwagi:
- dla powiązań współdzielonych kanoniczne pole docelowe pozostaje źródłem prawdy po powiązaniu/utworzeniu
- UI używa metadanych powiązania do renderowania odznak/ikon wskazujących origin pola

### CustomerLeadHistory
Tabela: `customer_lead_history`

Cel:
- oś czasu przejść etapów, przydzielenia, ostrzeżeń o duplikatach, powiązań, akcji konwersji i zdarzeń pozyskiwania

## Kontrakty API
Wszystkie trasy MUSZĄ eksportować `openApi`.

### CRUD Leadów
#### `GET /api/customers/leads`
- Zapytanie:
  - `page`, `pageSize<=100`
  - `search`
  - `pipelineId`
  - `stageId`
  - `outcome`
  - `ownerUserId`
  - `source`
  - `hasDuplicates`
  - `createdFrom`, `createdTo`
- Odpowiedź:
  - stronicowana lista wierszy leadów
  - podsumowanie duplikatów
  - podsumowanie powiązanych/stworzonych obiektów

#### `POST /api/customers/leads`
- Ciało:
  - podstawowe pola leada
  - ładunki sekcji
  - metadane źródłowe
  - opcjonalny początkowy potok/etap
- Odpowiedź:
  - `{ id }`

#### `PUT /api/customers/leads`
- Ciało:
  - `id`
  - mutowalne pola leada
  - edycje współdzielonych pól udostępnionych
- Odpowiedź:
  - `{ ok: true }`

#### `DELETE /api/customers/leads?id=<uuid>`
- Miękkie usunięcie rekordu leada

### Akcje Kwalifikacji
#### `POST /api/customers/leads/assign`
- Ciało: `id`, `ownerUserId`

#### `POST /api/customers/leads/advance-stage`
- Ciało: `id`, `stageId`
- Walidacja:
  - docelowy etap musi należeć do potoku leada
  - przejście do terminalnego etapu `won` może wymagać sprawdzenia gotowości do konwersji
  - przejście do etapu `lost` wymaga `lostReasonId`

#### `POST /api/customers/leads/mark-lost`
- Ciało: `id`, `lostReasonId`, opcjonalna `note`

### Wykrywanie Duplikatów
#### `POST /api/customers/leads/duplicate-check`
- Ciało:
  - `primaryEmail`
  - `primaryPhone`
  - `vatId`
  - opcjonalne bieżące id leada
- Odpowiedź:
  - możliwe pasujące `people`
  - możliwe pasujące `companies`
  - kubełki ufności wg dokładnego dopasowania pola

### Powiązanie / Tworzenie przed Ostateczną Konwersją
#### `POST /api/customers/leads/link-person`
- Ciało: `leadId`, `personId`

#### `POST /api/customers/leads/link-company`
- Ciało: `leadId`, `companyId`

#### `POST /api/customers/leads/link-deal`
- Ciało: `leadId`, `dealId`

#### `POST /api/customers/leads/create-person`
- Ciało:
  - `leadId`
  - opcjonalny ładunek nadpisujący
  - wybrane powiązania pól do użycia przy wstępnym wypełnieniu

#### `POST /api/customers/leads/create-company`
- Ciało analogiczne do create-person

#### `POST /api/customers/leads/create-deal`
- Ciało analogiczne do create-person

### Konwersja
#### `POST /api/customers/leads/convert`
- Ciało:
  - `leadId`
  - plan docelowy opisujący, które obiekty tworzyć, a które łączyć
  - opcjonalne nadpisania
  - wybrane transfery pól / powiązania współdzielone
  - potwierdzenie docelowego etapu `won`
- Odpowiedź:
  - referencje stworzonych/połączonych obiektów
  - podsumowanie konwersji

Kontrakt konwersji:
- konwersja jest jawna i podlega przeglądowi
- użytkownik musi wybierać lub potwierdzać cele
- UI musi wyraźnie pokazywać origin pól i własność docelową
- domyślne sugestie są dozwolone, cicha konwersja – nie

### Konfiguracyjne API
#### `GET/POST/PUT/DELETE /api/customers/lead-pipelines`
#### `GET/POST/PUT/DELETE /api/customers/lead-pipeline-stages`
#### `GET/POST/PUT/DELETE /api/customers/lead-lost-reasons`
#### `GET/POST/PUT/DELETE /api/customers/lead-field-bindings`

## Internacjonalizacja (i18n)
Wymagane klucze i18n dla:
- nawigacji i tytułów stron
- kolumn list, filtrów, akcji wierszy
- etykiet tablicy potoku
- sekcji szczegółowych leada
- ostrzeżeń o duplikatach
- akcji powiązania/tworzenia/konwersji
- odznak/ikon wskazujących origin pola
- konfiguracji potoku i powodów utraty
- komunikatów walidacyjnych i błędów

## UI/UX
UI leadów powinno stosować istniejące konwencje `customers` i `deals`:
- `DataTable` dla widoków listy
- `CrudForm` dla przepływów tworzenia/edycji/szczegółów
- wzorce `FormHeader` / `FormFooter`
- `ConfirmDialog` dla akcji destrukcyjnych lub terminalnych

### Trasy Backendowe
- `/backend/customers/leads`
- `/backend/customers/leads/create`
- `/backend/customers/leads/[id]`
- `/backend/customers/leads/pipeline`
- `/backend/config/customers/leads` dla konfiguracji administratora

### Nawigacja
- dodać `Leady` pod `customers`
- dodać wpis konfiguracyjny `Potoki Leadów` pod konfigurację klientów dla administratorów

### Lista Leadów
Główny widok listy:
- kolumny:
  - nazwa wyświetlana
  - potok
  - etap
  - właściciel
  - źródło
  - wskaźnik duplikatów
  - podsumowanie powiązanych/stworzonych obiektów
  - data utworzenia
- filtry:
  - potok
  - etap
  - wynik (outcome)
  - właściciel
  - źródło
  - obecność duplikatów
- eksporty obsługiwane

### Tablica Potoku Leadów
Widok tablicy podobny duchem do tablicy potoku deali:
- jedna tablica na potok
- kolumny wg etapu
- karty pokazują właściciela, źródło, flagi duplikatów i szybkie linki
- przeciągnij/upuść może być dodane, jeśli spójne z istniejącymi wzorcami tablicy

### Strona Szczegółowa Leada
Strona szczegółowa leada jest głównym obszarem roboczym.

Zalecane sekcje formularza:
- `Przegląd Leada`
- `Potencjalna Osoba`
- `Potencjalna Firma`
- `Potencjalny Deal`
- `Metadane Wyłącznie Leadowe`
- `Ładunek Źródłowy / Pozyskiwanie`
- `Powiązania i Konwersja`
- `Historia`

### Renderowanie Pól Współdzielonych
Pola udostępnione z obiektów docelowych muszą być wizualnie oznaczone:
- pole z firmy: ikona/odznaka firmy
- pole z osoby: ikona/odznaka osoby
- pole z dealu: ikona/odznaka dealu

Oznaczenie musi komunikować:
- gdzie pole należy kanonicznie
- czy jest wyłącznie leadowe, tylko do prefill, czy współdzielonym polem na żywo
- czy powiązany obiekt docelowy już istnieje

### UX Konwersji
Konwersja musi być jawna i podlegać przeglądowi.

Przepływ użytkownika:
1. otworzenie szczegółów leada
2. wybranie `Konwertuj`
3. przegląd, które cele tworzyć lub łączyć
4. przegląd transferowanych/współdzielonych pól
5. potwierdzenie docelowego etapu/wyniku
6. wykonanie konwersji

Ta interakcja przeglądowa może być przepływem pełnoekranowym lub ustrukturyzowanym dialogiem, ale nie może być cichą konwersją jednym kliknięciem.

### Ręczne Tworzenie/Powiązanie Podczas Kwalifikacji
Na stronie szczegółowej leada użytkownicy mogą:
- wyszukiwać i łączyć istniejącą osobę/firmę/deal
- tworzyć osobę/firmę/deal z leada przed ostateczną konwersją
- utrzymywać lead otwarty po tych akcjach

### Uprawnienia
Zakres początkowy:
- cała administracja leadami jest wyłącznie dla `admin`
- niestandardowe pola leadów są zarządzane przez administratora
- konfiguracja potoków, powodów utraty i powiązań pól jest zarządzana przez administratora

## Konfiguracja
Obszar konfiguracji administratora musi obsługiwać:
- tworzenie/edycję/archiwizację potoków leadów
- tworzenie/edycję/zmianę kolejności etapów
- tworzenie/edycję/zmianę kolejności powodów utraty
- zarządzanie niestandardowymi polami leadów
- zarządzanie regułami powiązań pól i metadanymi własności docelowej

## Wyszukiwanie i Analityka
### Wyszukiwanie
- dodanie indeksowania leadów w `customers/search.ts`
- pola z możliwością wyszukiwania:
  - nazwa wyświetlana
  - e-mail
  - telefon
  - NIP
  - źródło
  - etykiety potoku/etapu
  - wybrane pola tekstowe wyłącznie leadowe

### Analityka
Dodanie wymiarów analitycznych leadów:
- potok
- etap
- źródło
- właściciel
- wynik: wygrany/utracony
- powód utraty
- typ konwersji: powiązany vs nowo stworzony

### Widżety Dashboardu
Początkowe widżety:
- leady wg etapu
- przeterminowane leady
- ostatnio skonwertowane leady
- zestawienie powodów utraty
- skuteczność konwersji źródła

## Migracja i Kompatybilność
Ta zmiana jest addytywna i nie może naruszać istniejących powierzchni kontraktowych.

Reguły kompatybilności wstecznej:
- żadne istniejące trasy `customers` lub `deals` nie są zmieniane ani usuwane
- żadne istniejące ID zdarzeń nie są zmieniane ani usuwane
- żadne istniejące ID funkcji ACL nie są zmieniane ani usuwane
- żadne istniejące tabele/kolumny nie są zmieniane ani usuwane
- wszystkie dodatki to nowe trasy, zdarzenia, encje i powierzchnie konfiguracyjne

Wymagania rodowodowe:
- rekordy niższego poziomu stworzone z leada muszą zachowywać łącze z powrotem do leada
- istniejące API `person`, `company` i `deal` mogą zyskać addytywne opcjonalne pola pokazujące referencje origin leada

Przyszłościowość:
- wiele potoków jest obsługiwane od v1
- reguły powiązań pól są addytywne i konfigurowalne
- sekcje szczegółowe leada muszą używać stabilnych ID dla przyszłego wstrzykiwania widżetów

## Plan Implementacji
### Faza 1: Rdzeń Leadów
1. Dodanie encji, walidatorów, ACL, domyślnych ustawień, zdarzeń, konfiguracji wyszukiwania i rejestru komend.
2. Dodanie API CRUD/list/detail z `openApi`.
3. Dodanie listy leadów i UI szczegółowego pod `customers`.
4. Dodanie stron konfiguracji administracyjnej dla potoków i powodów utraty.

### Faza 2: Przepływ Kwalifikacji
1. Dodanie widoku tablicy wielu potoków i przejść etapów.
2. Dodanie wykrywania duplikatów wg e-maila, telefonu, NIP.
3. Dodanie przepływu przydzielania i powodów utraty.
4. Dodanie osi czasu historii leada.

### Faza 3: Powiązanie i Pola Współdzielone
1. Dodanie ręcznego powiązania/tworzenia osoby/firmy/dealu ze szczegółów leada.
2. Dodanie konfiguracji powiązań pól i wskaźników pól udostępnionych.
3. Implementacja zachowania write-through dla pól współdzielonych po powiązaniu/tworzeniu.

### Faza 4: Konwersja i Analityka
1. Implementacja jawnego przepływu przeglądu konwersji.
2. Utrwalanie rodowodu w rekordach niższego poziomu.
3. Dodanie wsparcia dla dashboardu/raportowania.
4. Dodanie testów integracyjnych i finalizacja przeglądu zgodności.

## Strategia Testowania
### Pokrycie Integracyjne
Wymagane scenariusze:
- ręczne tworzenie leada
- tworzenie leada przez ładunek źródłowy API
- ostrzeżenie o duplikacie dla istniejącej osoby/firmy
- przenoszenie leada przez etapy w wybranym potoku
- oznaczenie leada jako utracony z wymaganym powodem
- tworzenie firmy z leada przed ostateczną konwersją
- powiązanie istniejącej osoby/firmy z leadem
- konwersja leada do:
  - osoby
  - firmy
  - osoby + dealu
  - osoby + firmy + dealu
- weryfikacja rodowodu z obiektów docelowych z powrotem do leada
- weryfikacja, że edycja współdzielonych pól firmy/osoby w leadzie aktualizuje rekord kanoniczny po powiązaniu
- weryfikacja konfiguracji administratora dla potoków i powodów utraty

### Testy Niefunkcjonalne
- zakres tenanta i organizacji w każdym zapytaniu
- rozmiar strony pozostaje `<= 100`
- brak surowych fetch w stronach backendowych
- walidacja zod dla każdej mutacji

## Przegląd Ryzyk i Wpływu
#### Rozbieżność Pól Współdzielonych
- **Scenariusz**: Pole widoczne w leadzie i w powiązanej firmie rozbieżnieje, ponieważ oba przechowują osobne wartości.
- **Dotkliwość**: Krytyczna
- **Obszar dotknięty**: Szczegóły leada, integralność danych firmy/osoby/dealu, zaufanie do konwersji
- **Mitygacja**: Po powiązaniu/tworzeniu, współdzielone powiązania stają się projekcjami write-through do kanonicznych pól docelowych; żadna druga niezależna wartość nie pozostaje dla trybu współdzielonego.
- **Ryzyko rezydualne**: Błędnie skonfigurowane powiązania pól mogą nadal wystawiać na widok niewłaściwą własność docelową; UI administratora wymaga wyraźnej walidacji.

#### Częściowa Awaria Konwersji
- **Scenariusz**: Konwersja tworzy jeden obiekt docelowy, ale nie udaje się z drugim obiektem lub zapisem rodowodu.
- **Dotkliwość**: Wysoka
- **Obszar dotknięty**: Konwersja leada, audyt, spójność downstream CRM
- **Mitygacja**: Użycie komendy złożonej z granicami transakcji dla lokalnych zapisów; odroczenie niekluczowych efektów ubocznych do po zatwierdzeniu.
- **Ryzyko rezydualne**: Jeśli przyszłe integracje reagują asynchronicznie, zewnętrzna kompensacja może być opóźniona.

#### Błędna Klasyfikacja Duplikatów
- **Scenariusz**: Wykrywanie duplikatów sugeruje niewłaściwy rekord lub pomija prawdziwy duplikat.
- **Dotkliwość**: Średnia
- **Obszar dotknięty**: Przepływ pracy operatora, czystość danych
- **Mitygacja**: Model wyłącznie doradczy, jawne łączenie, widoczne dowody na to, dlaczego duplikat został zasugerowany.
- **Ryzyko rezydualne**: Ludzcy operatorzy mogą nadal celowo lub przypadkowo tworzyć duplikaty.

#### Nadmierna Konfiguracja Potoków
- **Scenariusz**: Administrator tworzy nadmiernie złożone potoki, które są trudne w obsłudze lub raportowaniu.
- **Dotkliwość**: Średnia
- **Obszar dotknięty**: Operacje leadowe, spójność analityki
- **Mitygacja**: Stabilne ustawienia domyślne, walidacja administracyjna, jeden domyślny potok, ograniczenia rodzaju etapów.
- **Ryzyko rezydualne**: Zmienność między tenantami nadal będzie komplikować wsparcie produktu i dokumentację.

#### Wrażliwość Ładunku Źródłowego
- **Scenariusz**: Surowy ładunek przychodzący zawiera wrażliwe lub zaszumione dane, które są zbyt szeroko udostępniane.
- **Dotkliwość**: Wysoka
- **Obszar dotknięty**: Prywatność, UI, powierzchnie audytu
- **Mitygacja**: Ograniczenie dostępu do ładunku źródłowego do autoryzowanych użytkowników, sanitacja znanych kluczy podobnych do sekretów w logach/UI.
- **Ryzyko rezydualne**: Schematy ładunków stron trzecich są nieprzewidywalne.

## Końcowy Raport Zgodności
## Końcowy Raport Zgodności — 2026-04-04

### Przejrzane Pliki AGENTS.md
- `AGENTS.md` (root)
- `.ai/specs/AGENTS.md`
- `packages/core/AGENTS.md`
- `packages/core/src/modules/customers/AGENTS.md`
- `packages/ui/AGENTS.md`

### Macierz Zgodności

| Źródło Reguły | Reguła | Status | Uwagi |
|---------------|--------|--------|-------|
| root AGENTS.md | Brak bezpośrednich relacji ORM między modułami | Zgodny | Spec używa ID powiązań i referencji rodowodowych, nie ORM między modułami |
| root AGENTS.md | Zawsze filtruj wg `organization_id` | Zgodny | Zawarte we wszystkich encjach i testach niefunkcjonalnych |
| root AGENTS.md | Waliduj wszystkie dane wejściowe za pomocą zod | Zgodny | Wymagane dla wszystkich mutacji |
| root AGENTS.md | API/UI używają współdzielonych wzorców | Zgodny | `DataTable`, `CrudForm`, współdzielone dialogi, współdzielone helpery API |
| `.ai/specs/AGENTS.md` | Zawierać TLDR, Przegląd, Problem, Rozwiązanie, Architekturę, Modele Danych, Kontrakty API, Ryzyka, Zgodność, Dziennik Zmian | Zgodny | Wszystkie wymagane sekcje obecne |
| `packages/core/AGENTS.md` | Trasy API MUSZĄ eksportować `openApi` | Zgodny | Jawnie wymagane w sekcji API |
| `packages/core/AGENTS.md` | Zdarzenia deklarowane za pomocą `createModuleEvents()` | Zgodny | Rodzina zdarzeń określona do deklaracji |
| `packages/core/src/modules/customers/AGENTS.md` | Używać modułu customers jako wzorca referencyjnego CRUD | Zgodny | Lead zaimplementowany wewnątrz customers używając istniejących wzorców CRUD/komend |
| `packages/ui/AGENTS.md` | Używać `DataTable` dla widoków listy | Zgodny | Lista leadów i UX potoku stosują wzorce backendowe |
| `packages/ui/AGENTS.md` | Używać `CrudForm` dla przepływów tworzenia/edycji | Zgodny | Przepływy szczegółowe/tworzenia leada używają `CrudForm` |

### Sprawdzenie Wewnętrznej Spójności

| Sprawdzenie | Status | Uwagi |
|-------------|--------|-------|
| Modele danych pasują do kontraktów API | Zaliczone | Endpointy CRUD, konfiguracji, powiązania i konwersji są zgodne z encjami |
| Kontrakty API pasują do sekcji UI/UX | Zaliczone | Lista, szczegóły, potok, konfiguracja i konwersja są reprezentowane w obu |
| Ryzyka obejmują wszystkie operacje zapisu | Zaliczone | Aktualizacja leada, zmiany etapów, powiązanie, konwersja, pola współdzielone są pokryte |
| Komendy zdefiniowane dla wszystkich mutacji | Zaliczone | Wszystkie kluczowe mutacje zmapowane do komend |
| Strategia pamięci podręcznej obejmuje wszystkie API odczytu | Zaliczone | Brak dedykowanej pamięci podręcznej wprowadzonej w specyfikacji; ścieżki odczytu pozostają bezpośrednie/oparte na zapytaniach |

### Niezgodne Elementy
- Brak zidentyfikowanych na etapie specyfikacji.

### Werdykt
- **W pełni zgodny**: Zatwierdzone — gotowe do planowania implementacji.

## Dziennik Zmian
### 2026-04-04
- Rozszerzono szkielet do pełnej roboczej specyfikacji dla lejka leadów klientów.
- Dodano obsługę wielu potoków, model powiązań pól współdzielonych, ręczne powiązanie/tworzenie przed konwersją i reguły rodowodowe.

### 2026-04-03
- Stworzono wstępny szkielet specyfikacji lejka leadów klientów.
