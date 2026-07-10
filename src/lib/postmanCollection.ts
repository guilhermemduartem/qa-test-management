/* ═══════════════════════════════════════════════════════════
   postmanCollection.ts — Geração de Collection Postman para o
   fluxo de DynamicPackage (Motor de Busca). Portado de
   ttt/index.html (Orion). Lógica pura, sem DOM.

   buildCollection() reproduz fielmente a saída de
   gerarCollectionPostman(): 1 item por cenário, cada um com os
   requests Login, Search, DoBooking, Get File, PayCreditCard e
   IssueSupplier, incluindo os scripts de teste/pré-request.
   ═══════════════════════════════════════════════════════════ */

export const LIMITE_PESSOAS = 10;

export interface Quarto {
  adt: number;
  chd: number;
  chdAges: number[];
}

export interface Scenario {
  nome: string;
  origem: string;
  destino: string;
  quartos: Quarto[];
}

interface InternalScenario {
  nome: string;
  idOrigem: string;
  idDestino: string;
  quartos: Quarto[];
}

/* Número → palavra (PT-BR, sem acentos). */
export function numberToPtWord(n: number): string {
  const map = [
    'Zero', 'Um', 'Dois', 'Tres', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez',
    'Onze', 'Doze', 'Treze', 'Quatorze', 'Quinze', 'Dezesseis', 'Dezessete', 'Dezoito', 'Dezenove', 'Vinte',
  ];
  return map[n] ?? String(n);
}

function generateSearchBody(s: InternalScenario) {
  return {
    Destinations: [
      {
        LocationFrom: { Id: parseInt(s.idOrigem, 10) },
        LocationTo: { Id: parseInt(s.idDestino, 10) },
        StartDate: '2025-09-12T00:00:00',
        EndDate: '2025-09-18T00:00:00',
      },
    ],
    Rooms: s.quartos.map((q) => ({ QtdAdt: q.adt, QtdChd: q.chd, ChdAge: q.chdAges })),
    ServiceTypeIds: [1, 2],
    CurrencyISO: 'BRL',
  };
}

function generateDoBookingBody(s: InternalScenario) {
  const rooms = s.quartos.map((q, idx) => {
    const roomId = idx + 1;
    const roomWord = numberToPtWord(roomId);
    const passengers: Record<string, unknown>[] = [];

    for (let i = 0; i < q.adt; i++) {
      const adultoWord = numberToPtWord(i + 1);
      const isMainPassenger = idx === 0 && i === 0;
      passengers.push({
        firstName: `QAQuarto${roomWord}`,
        lastName: `Adulto ${adultoWord}`,
        birthDate: `198${i}-01-15T00:00:00`,
        document: [{ documentType: { id: 1 }, documentNumber: `${roomId}${i}1234567890`.slice(0, 11) }],
        gender: { name: i % 2 === 0 ? 'M' : 'F', id: i % 2 === 0 ? 1 : 2 },
        phone: `55119999999${i + roomId}`,
        email: `adulto.${i + 1}.q${roomId}@miketec.com.br`,
        mainPassenger: isMainPassenger,
        Title: null,
      });
    }

    for (let c = 0; c < q.chd; c++) {
      const criancaWord = numberToPtWord(c + 1);
      passengers.push({
        firstName: `QAQuarto${roomWord}`,
        lastName: `Crianca ${criancaWord}`,
        birthDate: `${new Date().getFullYear() - q.chdAges[c]}-07-29T00:00:00`,
        document: [{ documentType: { id: 1 }, documentNumber: `${roomId}${c}9876543210`.slice(0, 11) }],
        gender: { name: c % 2 === 0 ? 'M' : 'F', id: c % 2 === 0 ? 1 : 2 },
        phone: `55119988888${c + roomId}`,
        email: `crianca.${c + 1}.q${roomId}@miketec.com.br`,
        mainPassenger: false,
        Title: null,
        ResponsibleAdultDocumentNumber: (passengers[0].document as { documentNumber: string }[])[0].documentNumber,
      });
    }

    return { id: roomId, passengers };
  });

  return {
    searchId: '{{searchId}}',
    rooms,
    contact: {
      firstName: 'Contato QA',
      lastName: 'Miketec',
      email: 'andre.castelli@miketec.com.br',
      companyName: 'Miketec',
      address: {
        ZipCode: '04207000',
        TypePublicPlace: { Name: 'Rua' },
        PublicPlace: 'Lino Coutinho',
        PublicPlaceNumber: '777',
        Location: {
          Id: 5088,
          Name: 'São Paulo',
          LocationFather: {
            Id: 231,
            Name: 'São Paulo',
            IATA: 'SP',
            LocationFather: { Id: 35, Name: 'Brasil', IATA: 'BR' },
          },
        },
      },
      phones: [{ DDD: '11', Number: '988888888', PhoneType: { Name: 'Home' } }],
    },
  };
}

/* ── Scripts de teste / pré-request (verbatim) ── */
const loginTestScript = [
  'const jsonData = pm.response.code == 200 ? pm.response.json() : undefined;',
  "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
  "pm.test('Response time is less than 500ms', function () { pm.expect(pm.response.responseTime).to.be.below(500); });",
  "pm.test('Content type is application/json', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'); });",
  "pm.test('Token and its properties exist', function () { const jsonData = pm.response.json(); pm.expect(jsonData.token).to.exist; pm.expect(jsonData.token.tokenId).to.exist; });",
  "pm.test('Value of success field is true', function () { const jsonData = pm.response.json(); pm.expect(jsonData.success).to.be.true; });",
  "pm.collectionVariables.set('tokenId_', jsonData?.token?.tokenId ?? undefined);",
];

const searchTestScript = [
  'var response = pm.response.json();',
  'var searchId = response.searchId;',
  "pm.environment.set('searchId', searchId);",
  'var destinationId = response.summary.destinations[0].destinationId;',
  "pm.environment.set('destinationId', destinationId);",
  'var hotelId = response.summary.destinations[0].selectedHotel.hotelId;',
  "pm.environment.set('hotelId', hotelId);",
  "pm.collectionVariables.set('searchResult', JSON.stringify(pm.response.json()));",
  "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
  "pm.test('Response time is less than 60000ms', function () { pm.expect(pm.response.responseTime).to.be.below(60000); });",
  "pm.test('Content type is application/json', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'); });",
];

const doBookingTestScript = [
  'var jsonData = pm.response.json();',
  'var fileId = jsonData.file.id;',
  "pm.collectionVariables.set('CollectionFileId', fileId);",
  "console.info('fileId: ' + fileId);",
  'var priceTotal = jsonData.file.priceTotal;',
  "pm.collectionVariables.set('priceTotal', priceTotal);",
  "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
  "pm.test('Response time is less than 60000ms', function () { pm.expect(pm.response.responseTime).to.be.below(60000); });",
  "pm.test('Content type is application/json', function () { pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'); });",
];

const getFileTestScript = [
  '// ------------------------------------------',
  '// PREPARAÇÃO INICIAL',
  '// ------------------------------------------',
  "const search = JSON.parse(pm.collectionVariables.get('searchResult'));",
  'const file = pm.response.json();',
  '',
  'const fileBookings = file.files?.[0]?.bookings || [];',
  'const filePassengers = file.files?.[0]?.passengers || [];',
  'const searchDest = search.summary?.destinations || [];',
  'const searchPassengers = search.passenger || [];',
  '',
  'const searchBookingFlight = searchDest?.[0]?.selectedFlight;',
  "const fileBookingFlight = fileBookings.find(b => b.serviceType?.name === 'Aereo')?.bookingDetailFlight;",
  '',
  'const totalSearchPassengers = (search.adt || 0) + (search.chd || 0);',
  'const totalFilePassengers = filePassengers.length;',
  '',
  'const fileBalanceDue = file.files?.[0]?.balanceDuePayment;',
  "pm.collectionVariables.set('balanceDuePayment', fileBalanceDue);",
  '',
  'const filePriceTotal = file.files?.[0]?.priceTotal;',
  'const searchPriceTotal = search.summary?.price?.priceTotal;',
  'const filePriceRate = file.files?.[0]?.priceRate;',
  'const searchPriceRate = search.summary?.price?.priceRate;',
  "pm.collectionVariables.set('FilepriceTotal', filePriceTotal);",
  '',
  "const fileHotelBooking = fileBookings.find(b => b.serviceType?.name === 'Hotel');",
  'const fileHotel = fileHotelBooking?.bookingDetailHotel;',
  'const searchHotel = searchDest?.[0]?.selectedHotel;',
  '',
  '// ------------------------------------------',
  '// TESTES BÁSICOS DA RESPOSTA',
  '// ------------------------------------------',
  "pm.test('Status code is 200', () => { pm.response.to.have.status(200); });",
  "pm.test('Response time is less than 2000ms', () => { pm.expect(pm.response.responseTime).to.be.below(2000); });",
  "pm.test('Content type is application/json', () => { pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json'); });",
  "pm.test('Arquivo foi criado com sucesso', () => { pm.expect(file.success).to.be.true; pm.expect(file.files.length).to.be.greaterThan(0); });",
  '',
  '// ------------------------------------------',
  '// COMPARAÇÃO ORIGEM E DESTINO AÉREO (DATAS VOO IDA/VOLTA)',
  '// ------------------------------------------',
  "pm.test('Comparar origem e destino - aéreo', () => {",
  '    if (!searchBookingFlight || !fileBookingFlight) {',
  "        console.warn('⚠️ Dados de voo insuficientes para comparação de datas.');",
  '        return;',
  '    }',
  '    pm.expect(fileBookingFlight.departureDate).to.eql(searchBookingFlight.departureDate);',
  '    pm.expect(fileBookingFlight.arrivalDate).to.eql(searchBookingFlight.arrivalDate);',
  '});',
  '',
  '// ------------------------------------------',
  '// COMPARAÇÃO QUANTIDADE DE PASSAGEIROS',
  '// ------------------------------------------',
  "pm.test('Comparar passageiros', () => {",
  "    console.log('Total passageiros buscados:', totalSearchPassengers);",
  "    console.log('Total passageiros no file:', totalFilePassengers);",
  '    pm.expect(totalFilePassengers).to.eql(totalSearchPassengers);',
  '});',
  '',
  '// ------------------------------------------',
  '// COMPARAÇÃO VALORES TOTAIS',
  '// ------------------------------------------',
  "pm.test('Comparar valores totais do file', () => {",
  "    console.log('File priceTotal:', filePriceTotal);",
  "    console.log('Search priceTotal:', searchPriceTotal);",
  '    pm.expect(filePriceTotal).to.eql(searchPriceTotal);',
  '    pm.expect(filePriceRate).to.eql(searchPriceRate);',
  '});',
  '',
  '// ------------------------------------------',
  '// COMPARAÇÃO DE DADOS DO HOTEL',
  '// ------------------------------------------',
  "pm.test('Comparar dados do hotel', () => {",
  "    if (!searchHotel) { console.warn('⚠️ Hotel não encontrado no searchResult'); return; }",
  "    if (!fileHotel) { console.warn('⚠️ Hotel não encontrado no file'); return; }",
  '    pm.expect(fileHotel.hotelName).to.eql(searchHotel.name);',
  '    pm.expect(Number(fileHotel.hotel?.id)).to.eql(Number(searchHotel.hotelId));',
  '    if (searchHotel.roomDescription && fileHotel.roomDescription) { pm.expect(fileHotel.roomDescription).to.eql(searchHotel.roomDescription); }',
  '    if (searchHotel.boardDescription && fileHotel.boardDescription) { pm.expect(fileHotel.boardDescription).to.eql(searchHotel.boardDescription); }',
  '});',
];

const payCreditCardPreRequest = [
  'function cpf() {',
  '  const rnd = (n) => Math.round(Math.random() * n);',
  '  const mod = (base, div) => Math.round(base - Math.floor(base / div) * div);',
  "  const n = Array(9).fill('').map(() => rnd(9));",
  '  let d1 = n.reduce((total, number, index) => (total + (number * (10 - index))), 0);',
  '  d1 = 11 - mod(d1, 11); if (d1 >= 10) d1 = 0;',
  '  let d2 = (d1 * 2) + n.reduce((total, number, index) => (total + (number * (11 - index))), 0);',
  '  d2 = 11 - mod(d2, 11); if (d2 >= 10) d2 = 0;',
  "  return `${n.join('')}${d1}${d2}`;",
  '}',
  'var cpfGerado = cpf();',
  "pm.environment.set('CPF', cpfGerado);",
  'console.info(cpfGerado);',
  'var now = new Date();',
  'var timestamp = now.toISOString();',
  "pm.environment.set('dateNow', timestamp);",
  "console.info('dateNow:' + timestamp);",
];

const payCreditCardTest = [
  'const responseJson = pm.response.json();',
  "const getFilePriceTotal = JSON.parse(pm.collectionVariables.get('priceTotal'));",
  "pm.test('Status code is 200', function () { pm.response.to.have.status(200); });",
  "pm.test('Response time is less than 40000ms', function () { pm.expect(pm.response.responseTime).to.be.below(40000); });",
  "pm.test('Validate paymentDateApproval', function () { pm.expect(responseJson.payment[0].paymentDateApproval).to.be.not.empty; });",
  "pm.test('Validate PaymentTotal', function () { pm.expect(responseJson.payment[0].total).to.eql(getFilePriceTotal); });",
  "pm.test('Validate PaymentStatus', function () { pm.expect(responseJson.payment[0].status.name).to.eql('Aprovado'); });",
];

const payCreditCardRawBody = `{
    "Payment": {
        "PaymentDateApproval": "{{dateNow}}",
        "File": {
            "Id": {{CollectionFileId}}
        },
        "Person": {
            "Name": "{{namePax}}",
            "BirthDate": "1977-09-08T00:00:00",
            "PersonType": {
                "Id": 1
            },
            "Document": [
                {
                    "DocumentType": {
                        "Id": 1
                    },
                    "DocumentNumber": "{{CPF}}"
                }
            ],
            "Address": [
                {
                    "ZipCode": "04207000",
                    "TypePublicPlace": {
                        "Id": 1
                    },
                    "PublicPlace": "Lino Coutinho",
                    "PublicPlaceNumber": "777",
                    "PublicPlaceComplement": "Ap 123",
                    "Neighborhood": "Ipiranga",
                    "Location": {
                        "Name": "São Paulo - São Paulo - Brasil",
                        "Id": 5088
                    }
                }
            ],
            "Email": [
                {
                    "Address": "andre.castelli@miketec.com.br"
                }
            ],
            "Phone": [
                {
                    "DDI": "55",
                    "DDD": "99",
                    "Number": "99999-9999"
                }
            ]
        },
        "PaymentPlan": {
            "QuantityInstallment": 10,
            "PaymentConnector": {
                "Id": 9
            },
            "CreditCard": {
                "Id": 1
            }
        },
        "Currency": {
            "Id": 1
        },
        "Total": {{FilepriceTotal}},
        "DiscountValue": 0,
        "DiscountDetails": [],
        "CreditCard": {
            "Name": "QA paga contas",
            "Document": "{{CPF}}",
            "DocumentType": {
                "Id": 1
            },
            "Number": "5113 XXXX XXXX 6939",
            "ValidityMonth": "7",
            "ValidityYear": "2031",
            "NSU": "12345679",
            "AcquirerTransactionId": "12345679",
            "AuthorizationCode": "12345679",
            "ExternalToken": "12345679",
            "ExternalPaymentId": "123458852454",
            "Email": "andre.castelli@miketec.com.br",
            "Address": "Lino Coutinho, 777 - Ap 77",
            "City": "São Paulo",
            "ZipCode": "04207000",
            "Country": "Brasil",
            "Phone": "+55 11 99999-9999"
        }
    }
}`;

export function collectionTimestamp(now = new Date()): string {
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${day}_${month}_${year}_${hours}_${minutes}_${seconds}`;
}

/** Constrói a collection Postman completa a partir dos cenários. */
export function buildCollection(scenarios: Scenario[], email: string, senha: string, timestamp: string) {
  const internos: InternalScenario[] = scenarios.map((c) => ({
    nome: c.nome,
    idOrigem: c.origem,
    idDestino: c.destino,
    quartos: c.quartos,
  }));

  return {
    info: {
      name: `DynamicPackage Collection Full Flow ${timestamp}`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: internos.map((s) => ({
      name: s.nome,
      item: [
        {
          name: 'Login',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: {
              mode: 'raw',
              raw: JSON.stringify({ Username: '{{username}}', Password: '{{password}}', CompanyId: '{{company}}' }, null, 2),
            },
            url: { raw: '{{host_backoffice}}/User/Login', host: ['{{host_backoffice}}'], path: ['User', 'Login'] },
          },
          event: [{ listen: 'test', script: { type: 'text/javascript', exec: loginTestScript } }],
        },
        {
          name: 'Search',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'tokenId', value: '{{tokenId_}}' },
            ],
            body: { mode: 'raw', raw: JSON.stringify(generateSearchBody(s), null, 2) },
            url: {
              raw: '{{host_dynamic_package}}/Sell/DynamicPackage/Search',
              host: ['{{host_dynamic_package}}'],
              path: ['Sell', 'DynamicPackage', 'Search'],
            },
          },
          event: [{ listen: 'test', script: { type: 'text/javascript', exec: searchTestScript } }],
        },
        {
          name: 'DoBooking',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'tokenId', value: '{{tokenId_}}' },
            ],
            body: { mode: 'raw', raw: JSON.stringify(generateDoBookingBody(s), null, 2) },
            url: {
              raw: '{{host_dynamic_package}}/Sell/DoBooking',
              host: ['{{host_dynamic_package}}'],
              path: ['Sell', 'DoBooking'],
            },
          },
          event: [{ listen: 'test', script: { type: 'text/javascript', exec: doBookingTestScript } }],
        },
        {
          name: 'Get File',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: { mode: 'raw', raw: '{\n    "File": {\n        "Id": {{CollectionFileId}}\n    },\n    "TokenId": "{{tokenId_}}"\n}' },
            url: { raw: '{{host_sell}}/File/Get', host: ['{{host_sell}}'], path: ['File', 'Get'] },
          },
          event: [{ listen: 'test', script: { type: 'text/javascript', exec: getFileTestScript } }],
        },
        {
          name: 'PayCreditCard',
          request: {
            method: 'POST',
            header: [
              { key: 'tokenId', value: '{{tokenId_}}', type: 'text' },
              { key: 'Content-Type', value: 'application/json' },
            ],
            body: { mode: 'raw', raw: payCreditCardRawBody },
            url: {
              raw: '{{host_sell}}/Sell/Payment/PayCreditCard',
              host: ['{{host_sell}}'],
              path: ['Sell', 'Payment', 'PayCreditCard'],
            },
          },
          event: [
            { listen: 'prerequest', script: { type: 'text/javascript', exec: payCreditCardPreRequest } },
            { listen: 'test', script: { type: 'text/javascript', exec: payCreditCardTest } },
          ],
        },
        {
          name: 'IssueSupplier',
          request: {
            method: 'POST',
            header: [
              { key: 'tokenId', value: '{{tokenId_}}', type: 'text' },
              { key: 'Content-Type', value: 'application/json' },
            ],
            body: { mode: 'raw', raw: '{\n\t"Booking": {\n\t\t"FileId": {{CollectionFileId}},\n\t\t"Id": 0\n\t}\n}' },
            url: {
              raw: '{{host_sell}}/Sells/Booking/IssueSupplier',
              host: ['{{host_sell}}'],
              path: ['Sells', 'Booking', 'IssueSupplier'],
            },
          },
        },
      ],
    })),
    variable: [
      { key: 'username', value: email },
      { key: 'password', value: senha },
      { key: 'company', value: '17' },
      { key: 'tokenId', value: '' },
      { key: 'host_backoffice', value: 'https://backoffice-api.dev-polaris.miketec.com.br' },
      { key: 'host_sell', value: 'https://sell-api.dev-polaris.miketec.com.br' },
      { key: 'host_dynamic_package', value: 'https://dynamic-package-api.dev-polaris.miketec.com.br' },
    ],
  };
}
