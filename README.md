# 🎲 BaianoBet PRO - Bolão Profissional

Aplicação completa de bolão de apostas para Copa 2026 com leaderboard, analytics e stats.

## 🚀 Deploy no Railway (RECOMENDADO)

### Passo 1️⃣: Registra no Railway
Acessa: https://railway.app (GitHub/Email)

### Passo 2️⃣: Conecta o repositório
- Clica "New Project"
- "Deploy from GitHub"
- Seleciona este repositório

### Passo 3️⃣: Railway faz TUDO automaticamente ✨
- ✅ Detecta Node.js
- ✅ Cria PostgreSQL automático
- ✅ Deploy pronto em 2 minutos!

**Pronto!** Sua URL: `https://seu-app.up.railway.app`

---

## 🏠 Rodar Localmente

### Pré-requisitos
- Node.js (v14+)
- PostgreSQL rodando

### Instalação

```bash
# 1. Instala dependências
npm install

# 2. Cria .env (copia de .env.example)
cp .env.example .env
# Edita DATABASE_URL com suas credenciais

# 3. Roda servidor
npm start
```

Acessa: `http://localhost:3000`

---

## 🎯 8 Features Principais

1. **⚽ Gols Dinâmicos** - Escolhe 2 gols? Aparecem 2 campos de jogadores
2. **🏆 Leaderboard** - Ranking com vitórias, taxa de acerto, ganhos totais
3. **⚠️ Confirmação ao Fechar** - Modal de segurança ao fechar jogo
4. **📊 KPI Dashboard** - Stats: total jogos, arrecadado, maior prêmio, jogadores
5. **📥 Exportar CSV** - Download completo das apostas
6. **🎭 Sistema de Rounds** - Agrupa jogos por fase (Quartas, Semis, Final)
7. **🎯 Stats Pessoais** - Cada jogador vê suas estatísticas
8. **🎲 Desempate Automático** - Resultado → Gols → Cartões

---

## 👤 Permissões

- **Primeiro usuário** = ADMIN (cria/fecha jogos, vê dashboard)
- **Próximos usuários** = Comuns (só apostam, veem leaderboard)

---

## 💰 Como Funciona

**Total Arrecadado = Soma de todos os aportes**

- **80%**: Prêmio principal (acertar resultado)
- **20%**: Prêmio de zueira

**Desempate:**
1. Resultado (ex: 2 x 1)
2. Gols (se múltiplos acertarem resultado)
3. Cartões (se ainda houver empate)

---

## 📱 Views

| View | Descrição |
|------|-----------|
| **Games** | Lista de todos os jogos abertos/fechados |
| **Leaderboard** | Ranking de jogadores |
| **Minhas Stats** | Estatísticas pessoais |
| **Dashboard Admin** | KPIs, exportar dados, análise (só admin) |

---

## 🔧 Variáveis de Ambiente

Railway configura automaticamente:
```
DATABASE_URL=postgresql://...  # PostgreSQL (automático)
PORT=3000                       # Porta
NODE_ENV=production            # Modo
```

Você customiza:
```
SECRET_KEY=seu_segredo_aqui    # Mude em produção!
```

---

## 📖 Como Usar

### Criar Jogo (Admin)
1. Clica "Criar Novo Jogo"
2. Preenche: Nome, Times, Aporte, (opcional) Round
3. Clica "Criar Jogo 🎯"

### Fazer Aposta
1. Clica "Ver Detalhes →"
2. Preenche: Gols, Marcadores, Cartões
3. Clica "Confirmar Aposta 🎯"

### Fechar Jogo (Admin)
1. Abre o jogo
2. Clica "Validar Fechamento"
3. Preenche resultado e cartões
4. Modal pede confirmação
5. Pronto! Sistema calcula vencedor automaticamente

### Ver Rankings
1. Clica "🏆 Leaderboard"
2. Vê ranking com wins, taxa, ganhos

### Exportar Dados (Admin)
1. Clica "Dashboard Admin"
2. Clica "📊 Exportar CSV"
3. Arquivo baixa com todas as apostas

---

## 🛠 Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL (Railway gera automaticamente)
- **Frontend**: React (CDN)
- **Auth**: JWT + bcrypt
- **Hospedagem**: Railway.app

---

## 📞 Suporte

Qualquer dúvida ou bug, avisa! Este app é super prático e pronto pra Copa 2026 🎉

---

**Desenvolvido com ☕ e muita diversão.**
