# Deployment Guide

Guide for deploying Plaid Connect to production.

## Pre-Deployment Checklist

- [ ] All features tested in staging
- [ ] Environment variables configured
- [ ] Production Plaid credentials obtained
- [ ] Database/storage solution chosen (if migrating from JSON)
- [ ] Authentication implemented
- [ ] Error handling comprehensive
- [ ] Logging configured
- [ ] Monitoring set up
- [ ] Security review completed

## Environment Setup

### 1. Production Environment Variables

Create production `.env` file:

```env
# Plaid Production Credentials
PLAID_CLIENT_ID=your_production_client_id
PLAID_PRODUCTION_SECRET=your_production_secret
PLAID_ENV=production

# Server Configuration
PORT=8000
NODE_ENV=production

# Database (if using)
DATABASE_URL=your_database_url

# Security
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret
```

### 2. Update Server Configuration

Ensure server uses production environment:

```javascript
// app/server/server.js
const plaidEnv = process.env.PLAID_ENV || 'sandbox';
const plaidSecret = plaidEnv === 'production' 
  ? process.env.PLAID_PRODUCTION_SECRET 
  : process.env.PLAID_SANDBOX_SECRET;

const configuration = new Configuration({
  basePath: plaidEnv === 'production' 
    ? PlaidEnvironments.production 
    : PlaidEnvironments.sandbox,
  // ...
});
```

## Deployment Options

### Option 1: Heroku

#### Setup

1. **Install Heroku CLI:**
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   
   # Windows
   # Download from https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Login to Heroku:**
   ```bash
   heroku login
   ```

3. **Create Heroku App:**
   ```bash
   heroku create plaid-connect-app
   ```

4. **Set Environment Variables:**
   ```bash
   heroku config:set PLAID_CLIENT_ID=your_id
   heroku config:set PLAID_PRODUCTION_SECRET=your_secret
   heroku config:set PLAID_ENV=production
   ```

5. **Deploy:**
   ```bash
   git push heroku staging:main
   ```

#### Procfile

Create `Procfile` in root:
```
web: cd app/server && npm start
```

---

### Option 2: AWS (EC2/Elastic Beanstalk)

#### EC2 Setup

1. **Launch EC2 Instance:**
   - Choose Ubuntu/Amazon Linux
   - Configure security groups (ports 80, 443, 8000)

2. **Install Dependencies:**
   ```bash
   sudo apt update
   sudo apt install nodejs npm git
   ```

3. **Clone and Setup:**
   ```bash
   git clone your-repo-url
   cd plaidConnect
   npm install
   cd app/server && npm install
   ```

4. **Use PM2 for Process Management:**
   ```bash
   npm install -g pm2
   pm2 start app/server/server.js --name plaid-connect
   pm2 startup
   pm2 save
   ```

5. **Configure Nginx (Reverse Proxy):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

### Option 3: Docker

#### Dockerfile

Create `Dockerfile` in `app/server/`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 8000

CMD ["node", "server.js"]
```

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  backend:
    build: ./app/server
    ports:
      - "8000:8000"
    environment:
      - PLAID_CLIENT_ID=${PLAID_CLIENT_ID}
      - PLAID_PRODUCTION_SECRET=${PLAID_PRODUCTION_SECRET}
      - PLAID_ENV=production
    volumes:
      - ./app/server/data:/app/data

  frontend:
    build: ./app/frontend
    ports:
      - "4000:4000"
    depends_on:
      - backend
```

#### Build and Run

```bash
docker-compose up -d
```

---

### Option 4: Vercel/Netlify (Frontend) + Backend Service

#### Frontend (Vercel)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   cd app/frontend
   vercel
   ```

3. **Configure Environment:**
   - Set `REACT_APP_API_URL` to your backend URL

#### Backend (Separate Service)

Deploy backend to Heroku, AWS, or similar service.

---

## Database Migration (Recommended)

### Current: JSON Files

Current implementation uses JSON files. For production, migrate to a database.

### Recommended: PostgreSQL

1. **Install PostgreSQL client:**
   ```bash
   npm install pg
   ```

2. **Create tables:**
   ```sql
   CREATE TABLE items (
     item_id VARCHAR PRIMARY KEY,
     access_token TEXT NOT NULL,
     user_id VARCHAR,
     created_at TIMESTAMP DEFAULT NOW()
   );

   CREATE TABLE accounts (
     account_id VARCHAR PRIMARY KEY,
     item_id VARCHAR REFERENCES items(item_id),
     account_data JSONB,
     updated_at TIMESTAMP DEFAULT NOW()
   );

   CREATE TABLE transactions (
     transaction_id VARCHAR PRIMARY KEY,
     item_id VARCHAR REFERENCES items(item_id),
     transaction_data JSONB,
     updated_at TIMESTAMP DEFAULT NOW()
   );
   ```

3. **Update server code:**
   - Replace file operations with database queries
   - Use connection pooling
   - Add migrations

---

## Security Hardening

### 1. Environment Variables

- Never commit `.env` files
- Use secure secret management (AWS Secrets Manager, etc.)
- Rotate secrets regularly

### 2. HTTPS

- Always use HTTPS in production
- Configure SSL certificates
- Redirect HTTP to HTTPS

### 3. Authentication

Add user authentication:

```javascript
// Example with JWT
const jwt = require('jsonwebtoken');

// Protect routes
const authenticate = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Use middleware
app.get('/api/accounts', authenticate, async (req, res) => {
  // ...
});
```

### 4. CORS

Restrict CORS to your frontend domain:

```javascript
const cors = require('cors');

app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://yourdomain.com',
  credentials: true
}));
```

### 5. Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## Monitoring

### 1. Logging

Use a logging service:
- Winston
- Pino
- CloudWatch (AWS)
- Loggly

### 2. Error Tracking

- Sentry
- Rollbar
- Bugsnag

### 3. Uptime Monitoring

- UptimeRobot
- Pingdom
- StatusCake

### 4. Performance Monitoring

- New Relic
- Datadog
- Application Insights

---

## Post-Deployment

### 1. Verify Deployment

- Test all endpoints
- Verify Plaid connection works
- Check error handling
- Test with real bank account (small test)

### 2. Monitor

- Watch error logs
- Monitor API usage
- Track response times
- Check Plaid API status

### 3. Backup

- Regular database backups
- Backup access tokens securely
- Document recovery procedures

---

## Rollback Plan

If issues occur:

1. **Immediate:**
   - Revert to previous deployment
   - Disable new features if needed

2. **Investigation:**
   - Check logs
   - Identify root cause
   - Fix in staging

3. **Re-deploy:**
   - Test thoroughly
   - Deploy fix
   - Monitor closely

---

## Scaling Considerations

### Current Limitations

- Single server instance
- JSON file storage
- No load balancing
- No caching

### Scaling Options

1. **Horizontal Scaling:**
   - Multiple server instances
   - Load balancer
   - Shared database

2. **Caching:**
   - Redis for session storage
   - Cache API responses
   - CDN for static assets

3. **Database:**
   - Read replicas
   - Connection pooling
   - Query optimization

---

## Support

- **Documentation:** See other docs in `/docs`
- **Plaid Support:** https://dashboard.plaid.com/support
- **Monitoring:** Set up alerts for critical errors

---

## Related Documentation

- [Environment Variables](./ENVIRONMENT.md)
- [API Documentation](./API.md)
- [Architecture Overview](./ARCHITECTURE.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

