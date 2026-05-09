# Zyntrix CRM Backend

Express + MongoDB backend for Zyntrix CRM.

## 1. Local Setup

1. Install dependencies:
   npm install
2. Create environment file from template:
   copy .env.example .env
3. Update values in `.env`.
4. Run in development:
   npm run dev

## 2. Required Environment Variables

- `PORT`
- `JWT_SECRET`
- `MONGO_URI`
- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `FRONTEND_URL`

## 3. GitHub Upload Checklist

1. Ensure `.env` is never committed.
2. Keep only `.env.example` in repository.
3. Ensure `node_modules` is not committed.
4. Commit backend source and `package-lock.json`.

## 4. Railway Deployment (GitHub)

1. Import repository in Railway.
2. Set **Root Directory** to `Backend`.
3. Add all required environment variables in Railway.
4. Deploy. Railway will run `npm install` and `npm start`.

## 5. Password Reset Flow Notes

- Forgot password accepts office mail domain only (`@zyntrixsoftware.com`).
- User must exist in database.
- Reset link is sent to employee office mail.
- Reset link uses `FRONTEND_URL`.
