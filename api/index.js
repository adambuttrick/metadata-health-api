import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const router = express.Router();

app.use(cors({
    origin: '*',
    credentials: false
}));

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'DataCite Metadata Health API',
            version: '1.0.0',
            description: 'API for accessing DataCite provider and client metadata and completeness statistics'
        },
        servers: [
            {
                url: 'https://metadata-health-api.vercel.app',
                description: 'Production server'
            }
        ]
    },
    apis: [__filename],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.use('/docs', swaggerUi.serve);
app.get('/docs', swaggerUi.setup(swaggerDocs, {
    explorer: true,
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js'
    ]
}));

app.use('/redoc', swaggerUi.serve, swaggerUi.setup(swaggerDocs, { customSiteTitle: 'API Documentation' }));

class DataCache {
    constructor() {
        this.providersAttributes = {};
        this.providersStats = {};
        this.clientsAttributes = {};
        this.clientsStats = {};
        this.timestamp = '';
        this.isInitialized = false;
    }

    async loadData() {
        if (this.isInitialized) return;

        try {
            const dataDir = path.join(__dirname, 'data');
            
            const [providersAttributes, providersStats, clientsAttributes, clientsStats] = await Promise.all([
                readFile(path.join(dataDir, 'providers_attributes.json'), 'utf8'),
                readFile(path.join(dataDir, 'providers_stats.json'), 'utf8'),
                readFile(path.join(dataDir, 'clients_attributes.json'), 'utf8'),
                readFile(path.join(dataDir, 'clients_stats.json'), 'utf8')
            ]);
            
            const parseAndStore = (jsonString, targetObject) => {
                const parsed = JSON.parse(jsonString);
                if (parsed.data) {
                    parsed.data.forEach(item => {
                        if (item.id) {
                            targetObject[item.id] = item;
                        }
                    });
                }
            };

            parseAndStore(providersAttributes, this.providersAttributes);
            parseAndStore(providersStats, this.providersStats);
            parseAndStore(clientsAttributes, this.clientsAttributes);
            parseAndStore(clientsStats, this.clientsStats);

            this.timestamp = new Date().toISOString();
            this.isInitialized = true;

        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
    }

    mergeProviderData(providerId) {
        const attributes = this.providersAttributes[providerId];
        const stats = this.providersStats[providerId];

        if (!attributes) {
            return null;
        }

        const result = { ...attributes };
        if (stats) {
            result.stats = stats.stats;
        }
        return result;
    }

    mergeClientData(clientId) {
        const attributes = this.clientsAttributes[clientId];
        const stats = this.clientsStats[clientId];

        if (!attributes) {
            return null;
        }

        const result = { ...attributes };
        if (stats) {
            result.stats = stats.stats;
        }
        return result;
    }

    getAllProviders() {
        return Object.keys(this.providersAttributes).map(pid => this.mergeProviderData(pid));
    }

    getAllClients() {
        return Object.keys(this.clientsAttributes).map(cid => this.mergeClientData(cid));
    }

    getProviderClients(providerId) {
        const provider = this.providersAttributes[providerId];
        if (!provider || !provider.relationships?.clients) {
            return [];
        }

        return provider.relationships.clients
            .map(clientId => this.clientsAttributes[clientId])
            .filter(client => client !== null);
    }

    getAllProviderAttributes() {
        return Object.values(this.providersAttributes);
    }

    getAllClientAttributes() {
        return Object.values(this.clientsAttributes);
    }
}

const cache = new DataCache();

// Middleware to ensure cache is initialized
const ensureCacheInitialized = async (req, res, next) => {
    if (!cache.isInitialized) {
        try {
            await cache.loadData();
        } catch (error) {
            return res.status(500).json({ error: 'Failed to initialize data cache' });
        }
    }
    next();
};

router.use(cors({
    origin: '*',
    methods: ['GET'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

router.use(ensureCacheInitialized);

/**
 * @swagger
 * /api/v1/providers/attributes:
 *   get:
 *     summary: List All Provider Attributes
 *     description: Returns a list of all DataCite providers with their attributes and relationships (no stats)
 *     tags: [Providers]
 *     responses:
 *       200:
 *         description: Array of DataCite providers with their attributes
 */
router.get('/providers/attributes', (req, res) => {
    const providers = cache.getAllProviderAttributes();
    res.json({
        data: providers,
        meta: {
            total: providers.length,
            timestamp: cache.timestamp
        }
    });
});

/**
 * @swagger
 * /api/v1/providers/{providerId}:
 *   get:
 *     summary: Get Provider Details
 *     description: Returns detailed information for a specific DataCite provider
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed provider information
 *       404:
 *         description: Provider not found
 */
router.get('/providers/:providerId', (req, res) => {
    const provider = cache.mergeProviderData(req.params.providerId);
    if (!provider) {
        return res.status(404).json({ detail: `Provider ${req.params.providerId} not found` });
    }
    res.json({ data: provider });
});

/**
 * @swagger
 * /api/v1/providers/{providerId}/attributes:
 *   get:
 *     summary: Get Provider Attributes
 *     description: Returns only the attributes and relationships for a specific DataCite provider
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Provider attributes information
 *       404:
 *         description: Provider attributes not found
 */
router.get('/providers/:providerId/attributes', (req, res) => {
    const provider = cache.providersAttributes[req.params.providerId];
    if (!provider) {
        return res.status(404).json({ detail: `Provider ${req.params.providerId} attributes not found` });
    }
    res.json({ data: provider });
});

/**
 * @swagger
 * /api/v1/providers/{providerId}/stats:
 *   get:
 *     summary: Get Provider Stats
 *     description: Returns detailed statistics for a specific DataCite provider
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Provider statistics information
 *       404:
 *         description: Provider stats not found
 */
router.get('/providers/:providerId/stats', (req, res) => {
    const provider = cache.providersStats[req.params.providerId];
    if (!provider) {
        return res.status(404).json({ 
            detail: `Provider ${req.params.providerId} stats not found. Stats may not be available for this provider.` 
        });
    }
    res.json({ data: provider });
});

/**
 * @swagger
 * /api/v1/providers/{providerId}/clients:
 *   get:
 *     summary: List Provider Clients
 *     description: Returns a list of clients associated with a specific provider
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of clients belonging to the specified provider
 *       404:
 *         description: Provider not found or no clients found
 */
router.get('/providers/:providerId/clients', (req, res) => {
    if (!(req.params.providerId in cache.providersAttributes)) {
        return res.status(404).json({ detail: `Provider ${req.params.providerId} not found` });
    }

    const clients = cache.getProviderClients(req.params.providerId);
    if (!clients.length) {
        return res.status(404).json({ detail: `No clients found for provider ${req.params.providerId}` });
    }
    res.json({ data: clients });
});

/**
 * @swagger
 * /api/v1/clients/attributes:
 *   get:
 *     summary: List All Client Attributes
 *     description: Returns a list of all DataCite clients with their attributes and relationships (no stats)
 *     tags: [Clients]
 *     responses:
 *       200:
 *         description: Array of DataCite clients with their attributes
 */
router.get('/clients/attributes', (req, res) => {
    const clients = cache.getAllClientAttributes();
    res.json({
        data: clients,
        meta: {
            total: clients.length,
            timestamp: cache.timestamp
        }
    });
});

/**
 * @swagger
 * /api/v1/clients/{clientId}:
 *   get:
 *     summary: Get Client Details
 *     description: Returns detailed information for a specific DataCite client
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed client information
 *       404:
 *         description: Client not found
 */
router.get('/clients/:clientId', (req, res) => {
    const client = cache.mergeClientData(req.params.clientId);
    if (!client) {
        return res.status(404).json({ detail: `Client ${req.params.clientId} not found` });
    }
    res.json({ data: client });
});

/**
 * @swagger
 * /api/v1/clients/{clientId}/attributes:
 *   get:
 *     summary: Get Client Attributes
 *     description: Returns only the attributes and relationships for a specific DataCite client
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client attributes information
 *       404:
 *         description: Client attributes not found
 */
router.get('/clients/:clientId/attributes', (req, res) => {
    const client = cache.clientsAttributes[req.params.clientId];
    if (!client) {
        return res.status(404).json({ detail: `Client ${req.params.clientId} attributes not found` });
    }
    res.json({ data: client });
});

/**
 * @swagger
 * /api/v1/clients/{clientId}/stats:
 *   get:
 *     summary: Get Client Stats
 *     description: Returns detailed statistics for a specific DataCite client
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client statistics information
 *       404:
 *         description: Client stats not found
 */
router.get('/clients/:clientId/stats', (req, res) => {
    const client = cache.clientsStats[req.params.clientId];
    if (!client) {
        return res.status(404).json({ 
            detail: `Client ${req.params.clientId} stats not found. Stats may not be available for this client.` 
        });
    }
    res.json({ data: client });
});

app.get('/', (req, res) => {
    res.redirect('/docs');
});

app.use('/api/v1', router);

export default app;

export const config = {
    api: {
        bodyParser: false,
    },
};