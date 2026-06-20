import 'dotenv/config'

process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message, err.stack)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason)
  process.exit(1)
})

try {
  const { default: app } = await import('./app.js')
  const { validateEnv } = await import('./config.js')

  await validateEnv()

  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
  })
} catch (err) {
  console.error('[CRASH] Falha ao iniciar:', err.message, err.stack)
  process.exit(1)
}
