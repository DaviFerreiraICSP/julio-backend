import bcrypt from 'bcrypt'
import db from './db.js'

const DEV_EMAIL = 'davidossantosferreirasilva@gmail.com'
const DEV_PASSWORD = 'C@ca2012'

export async function validateEnv() {
  if (!process.env.JWT_SECRET) {
    console.error('\nJWT_SECRET nao definido no .env\n')
    process.exit(1)
  }
  await seedDevUser()
}

async function seedDevUser() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEV_EMAIL)
  if (!existing) {
    const hash = await bcrypt.hash(DEV_PASSWORD, 10)
    db.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run('user_dev', DEV_EMAIL, hash, 'dev')
    console.log('[config] Usuario dev criado.')
  }
}

export async function refreshPasswordHash() {}
