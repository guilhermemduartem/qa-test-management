/* GERADO por gen-data.mjs a partir de src/lib/apisStorage.ts — não editar à mão. */
window.APIS_DATA = {
  "environments": [
    {
      "id": "dev-orion",
      "name": "Dev Orion K8S"
    },
    {
      "id": "dev-polaris",
      "name": "Dev Polaris K8S"
    },
    {
      "id": "qa",
      "name": "QA K8S"
    },
    {
      "id": "tst-azul",
      "name": "TST Azul"
    },
    {
      "id": "stg",
      "name": "STG K8S"
    },
    {
      "id": "prod",
      "name": "Produção"
    }
  ],
  "services": [
    {
      "id": "accounting",
      "name": "Accounting",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://accounting-api.miketec.com.br",
        "dev-orion": "https://accounting-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://accounting-api.dev.miketec.com.br",
        "qa": "https://accounting-api.qapolarisk8.miketec.com.br",
        "stg": "https://accounting-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "activity",
      "name": "Activity",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://activity-api.miketec.com.br",
        "dev-orion": "https://activity-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://activity-api.dev-polarisk8.miketec.com.br",
        "qa": "https://activity-api.qapolarisk8.miketec.com.br",
        "stg": "https://activity-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://acc-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "air",
      "name": "Air",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://air-api.miketec.com.br",
        "dev-orion": "https://air-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://air-api.dev-polarisk8.miketec.com.br",
        "qa": "https://air-api.qapolarisk8.miketec.com.br",
        "stg": "https://air-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://air-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "allotment",
      "name": "Allotment",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://allotment-api.miketec.com.br",
        "dev-orion": "https://allotment-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://allotment-api.dev-polarisk8.miketec.com.br",
        "qa": "https://allotment-api.qapolarisk8.miketec.com.br",
        "stg": "https://allotment-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "backoffice",
      "name": "Backoffice",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://backoffice-api.miketec.com.br",
        "dev-orion": "https://backoffice-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://backoffice-api.dev-polarisk8.miketec.com.br",
        "qa": "https://backoffice-api.qapolarisk8.miketec.com.br",
        "stg": "https://backoffice-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://bko-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "bank",
      "name": "Bank",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://bank-api.miketec.com.br",
        "dev-orion": "https://bank-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://bank-api.dev-polarisk8.miketec.com.br",
        "qa": "https://bank-api.qapolarisk8.miketec.com.br",
        "stg": "https://bank-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "bi",
      "name": "BI",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://bi-api.miketec.com.br",
        "dev-orion": "https://bi-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://bi-api.dev-polarisk8.miketec.com.br",
        "qa": "https://bi-api.qapolarisk8.miketec.com.br",
        "stg": "https://bi-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://bii-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "broker",
      "name": "Broker",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://broker-api.miketec.com.br",
        "dev-orion": "https://broker-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://broker-api.dev-polarisk8.miketec.com.br",
        "qa": "https://broker-api.qapolarisk8.miketec.com.br",
        "stg": "https://broker-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://brk-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "car",
      "name": "Car",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://car-api.miketec.com.br",
        "dev-orion": "https://car-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://car-api.dev-polarisk8.miketec.com.br",
        "qa": "https://car-api.qapolarisk8.miketec.com.br",
        "stg": "https://car-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://car-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "conciliation-supplier",
      "name": "Conciliation Supplier",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://conciliation-supplier-api.miketec.com.br",
        "dev-orion": "https://conciliation-supplier-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://conciliation-supplier-api.dev-polarisk8.miketec.com.br",
        "qa": "https://conciliation-supplier-api.qapolarisk8.miketec.com.br",
        "stg": "https://conciliation-supplier-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "dynamicpackage",
      "name": "Dynamic Package",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://dynamic-package-api.miketec.com.br",
        "dev-orion": "https://dynamic-package-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://dynamic-package-api.dev-polarisk8.miketec.com.br",
        "qa": "https://dynamic-package-api.qapolarisk8.miketec.com.br",
        "stg": "https://dynamic-package-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://dyp-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "financial",
      "name": "Financial",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://financial-api.miketec.com.br",
        "dev-orion": "https://financial-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://financial-api.dev-polarisk8.miketec.com.br",
        "qa": "https://financial-api.qapolarisk8.miketec.com.br",
        "stg": "https://financial-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://fin-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "hotel",
      "name": "Hotel",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://hotel-api.miketec.com.br",
        "dev-orion": "https://hotel-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://hotel-api.dev-polarisk8.miketec.com.br",
        "qa": "https://hotel-api.qapolarisk8.miketec.com.br",
        "stg": "https://hotel-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://htl-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "integration",
      "name": "Integration",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://integration-api.miketec.com.br",
        "dev-orion": "https://integration-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://integration-api.dev-polarisk8.miketec.com.br",
        "qa": "https://integration-api.qapolarisk8.miketec.com.br",
        "stg": "https://integration-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://int-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "log",
      "name": "Log",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://log-api.miketec.com.br",
        "dev-orion": "https://log-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://log-api.dev-polarisk8.miketec.com.br",
        "qa": "https://log-api.qapolarisk8.miketec.com.br",
        "stg": "https://log-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "loyalty",
      "name": "Loyalty",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://loyalty-api.miketec.com.br",
        "dev-orion": "https://loyalty-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://loyalty-api.dev-polarisk8.miketec.com.br",
        "qa": "https://loyalty-api.qapolarisk8.miketec.com.br",
        "stg": "https://loyalty-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://lyl-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "package",
      "name": "Package",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://package-api.miketec.com.br",
        "dev-orion": "https://package-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://package-api.dev-polarisk8.miketec.com.br",
        "qa": "https://package-api.qapolarisk8.miketec.com.br",
        "stg": "https://package-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://pkg-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "pdf",
      "name": "PDF",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://pdf-api.miketec.com.br",
        "dev-orion": "https://pdf-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://pdf-api.dev-polarisk8.miketec.com.br",
        "qa": "https://pdf-api.qapolarisk8.miketec.com.br",
        "stg": "https://pdf-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "promocode-backoffice",
      "name": "Promocode Backoffice",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://promocode-backoffice-api.miketec.com.br",
        "dev-orion": "https://promocode-backoffice-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://promocode-backoffice-api.dev-polarisk8.miketec.com.br",
        "qa": "https://promocode-backoffice-api.qapolarisk8.miketec.com.br",
        "stg": "https://promocode-backoffice-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "promocode-engine",
      "name": "Promocode Engine",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://promocode-engine-api.miketec.com.br",
        "dev-orion": "https://promocode-engine-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://promocode-engine-api.dev-polarisk8.miketec.com.br",
        "qa": "https://promocode-engine-api.qapolarisk8.miketec.com.br",
        "stg": "https://promocode-engine-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "promocode-sell",
      "name": "Promocode Sell",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://promocode-sell-api.miketec.com.br",
        "dev-orion": "https://promocode-sell-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://promocode-sell-api.dev-polarisk8.miketec.com.br",
        "qa": "https://promocode-sell-api.qapolarisk8.miketec.com.br",
        "stg": "https://promocode-sell-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "road",
      "name": "Road",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://road-api.miketec.com.br",
        "dev-orion": "https://road-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://road-api.dev-polarisk8.miketec.com.br",
        "qa": "https://road-api.qapolarisk8.miketec.com.br",
        "stg": "https://road-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://rod-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "sell",
      "name": "Sell",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://sell-api.miketec.com.br",
        "dev-orion": "https://sell-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://sell-api.dev-polarisk8.miketec.com.br",
        "qa": "https://sell-api.qapolarisk8.miketec.com.br",
        "stg": "https://sell-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://sel-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "sell-change",
      "name": "Sell Change",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://sell-change-api.miketec.com.br",
        "dev-orion": "https://sell-change-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://sell-change-api.dev-polarisk8.miketec.com.br",
        "qa": "https://sell-change-api.qapolarisk8.miketec.com.br",
        "stg": "https://sell-change-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "service",
      "name": "Service",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://service-api.miketec.com.br",
        "dev-orion": "https://service-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://service-api.dev-polarisk8.miketec.com.br",
        "qa": "https://service-api.qapolarisk8.miketec.com.br",
        "stg": "https://service-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://ser-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "synchronization",
      "name": "Synchronization",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://synchronization-api.miketec.com.br",
        "dev-orion": "https://synchronization-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://synchronization-api.dev-polarisk8.miketec.com.br",
        "qa": "https://synchronization-api.qapolarisk8.miketec.com.br",
        "stg": "https://synchronization-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://syn-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "ticket",
      "name": "Ticket",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://ticket-api.miketec.com.br",
        "dev-orion": "https://ticket-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://ticket-api.dev-polarisk8.miketec.com.br",
        "qa": "https://ticket-api.qapolarisk8.miketec.com.br",
        "stg": "https://ticket-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://tkt-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "tour",
      "name": "Tour",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://tour-api.miketec.com.br",
        "dev-orion": "https://tour-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://tour-api.dev-polarisk8.miketec.com.br",
        "qa": "https://tour-api.qapolarisk8.miketec.com.br",
        "stg": "https://tour-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://tur-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "transfer",
      "name": "Transfer",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://transfer-api.miketec.com.br",
        "dev-orion": "https://transfer-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://transfer-api.dev-polarisk8.miketec.com.br",
        "qa": "https://transfer-api.qapolarisk8.miketec.com.br",
        "stg": "https://transfer-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://trf-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "travelassistance",
      "name": "Travel Assistance",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://travel-assistance-api.miketec.com.br",
        "dev-orion": "https://travel-assistance-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://travel-assistance-api.dev-polarisk8.miketec.com.br",
        "qa": "https://travel-assistance-api.qapolarisk8.miketec.com.br",
        "stg": "https://travel-assistance-api.stgpolarisk8.miketec.com.br",
        "tst-azul": "http://tas-api-tst.aws.voeazul.com.br"
      }
    },
    {
      "id": "workflow",
      "name": "Workflow",
      "healthPath": "/HealthCheck",
      "method": "GET",
      "envUrls": {
        "prod": "https://workflow-api.miketec.com.br",
        "dev-orion": "https://workflow-api.dev-orionk8.miketec.com.br",
        "dev-polaris": "https://workflow-api.dev-polarisk8.miketec.com.br",
        "qa": "https://workflow-api.qapolarisk8.miketec.com.br",
        "stg": "https://workflow-api.stgpolarisk8.miketec.com.br"
      }
    },
    {
      "id": "talenttrack-core",
      "name": "TalentTrack - Core",
      "healthPath": "/healthcheck",
      "method": "GET",
      "envUrls": {
        "dev-orion": "https://api.dev.aztalent.app",
        "stg": "https://api.stg.aztalent.app",
        "prod": "https://api.aztalent.app"
      }
    },
    {
      "id": "talenttrack-onetoone",
      "name": "TalentTrack - One to One",
      "healthPath": "/healthcheck",
      "method": "GET",
      "envUrls": {
        "dev-orion": "https://onetoone-api.dev.aztalent.app",
        "stg": "https://onetoone-api.stg.aztalent.app",
        "prod": "https://onetoone-api.aztalent.app"
      }
    },
    {
      "id": "talenttrack-nr1",
      "name": "TalentTrack - NR1",
      "healthPath": "/healthcheck",
      "method": "GET",
      "envUrls": {
        "dev-orion": "https://nr1-api.dev.aztalent.app",
        "stg": "https://nr1-api.stg.aztalent.app",
        "prod": "https://nr1-api.aztalent.app"
      }
    }
  ]
};
