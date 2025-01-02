# Metadata Health API

API for the demo metadata health reports.

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- A Vercel account for deployment

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/your-username/metadata-health-api.git
cd metadata-health-api
```

2. Install dependencies:
```bash
npm install
```

3. Place your data files in the `api/data` directory:
- `providers_attributes.json`
- `providers_stats.json`
- `clients_attributes.json`
- `clients_stats.json`

4. Start the development server:
```bash
npm start
```

The API will be available at `http://localhost:3000`

## API Documentation

Once running, you can access the API documentation at:
- Swagger UI: `/docs`