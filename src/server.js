import 'dotenv/config'
import app from './app.js'
import { validateEnv } from './config.js'

validateEnv()

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🎉 Servidor rodando em http://localhost:${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/api/health\n`)
})
