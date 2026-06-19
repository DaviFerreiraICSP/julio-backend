import jwt from 'jsonwebtoken'

function decode(req, res) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token nao fornecido.' })
    return null
  }
  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET)
  } catch {
    res.status(401).json({ error: 'Token invalido ou expirado.' })
    return null
  }
}

export function requireAdmin(req, res, next) {
  const payload = decode(req, res)
  if (!payload) return
  if (!['admin', 'dev'].includes(payload.role)) {
    return res.status(403).json({ error: 'Sem permissao.' })
  }
  req.admin = payload
  next()
}

export function requireDev(req, res, next) {
  const payload = decode(req, res)
  if (!payload) return
  if (payload.role !== 'dev') {
    return res.status(403).json({ error: 'Apenas o desenvolvedor tem acesso.' })
  }
  req.admin = payload
  next()
}
