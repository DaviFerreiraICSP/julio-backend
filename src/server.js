import 'dotenv/config'

process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason)
  process.exit(1)
})

import app from './app.js'
import { validateEnv } from './config.js'

const PORT = process.env.PORT || 3001

validateEnv().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
    console.log(`Health: http://localhost:${PORT}/api/health`)
  })
}).catch(err => {
  console.error('[CRASH] Falha no startup:', err)
  process.exit(1)
})
