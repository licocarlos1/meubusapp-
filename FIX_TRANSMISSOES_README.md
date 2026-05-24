# 🔧 Correção de Transmissões Órfãs - Guia de Aplicação

## 📋 Problemas Corrigidos

### ✅ Problema 1: Transmissões Abertas Indefinidamente
**Causa**: Quando o usuário fechava o navegador ou saía do app sem clicar em "Encerrar Viagem", a transmissão ficava aberta para sempre no banco de dados.

**Solução**: 
- Sistema de **heartbeat** a cada 30 segundos
- Detecção automática quando usuário fecha o navegador (`beforeunload`)
- Verificação de **sessão órfã ao carregar Broadcaster** (>60 min)
- Botão de limpeza manual no Admin
- Script SQL para limpeza automática

### ✅ Problema 2: Timer de 60 Minutos Morria com o Navegador
**Causa**: O `setTimeout` de 60 minutos era executado apenas no cliente. Se o usuário fechasse o navegador antes, o timer morria.

**Solução**:
- **Verificação no servidor** ao carregar o Broadcaster
- Se existe sessão aberta há >60 min, finaliza automaticamente
- Função SQL `cleanup_stale_transmissions()` independente do cliente

---

## 🚀 Como Aplicar as Correções

### Passo 1: Executar SQL no Supabase

1. Acesse o painel do Supabase → SQL Editor
2. Cole e execute o arquivo: **`fix_transmissoes_orfas.sql`**

Este script irá:
- ✅ Finalizar TODAS as transmissões abertas há mais de 2 horas
- ✅ Remover posições de ônibus órfãs
- ✅ Criar função automática de limpeza (`cleanup_stale_transmissions()`)
- ✅ Adicionar trigger de timestamp automático

### Passo 2: Atualizar o Banco de Dados

Execute também este SQL simples para adicionar a coluna de heartbeat:

```sql
ALTER TABLE historico_transmissoes
ADD COLUMN IF NOT EXISTS ultima_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

### Passo 3: Fazer Deploy das Alterações do Frontend

Os arquivos já foram atualizados:
- ✅ `src/pages/Broadcaster.jsx` - Heartbeat + limpeza automática
- ✅ `src/pages/Admin.jsx` - Botão de limpeza + status visual

---

## 🎯 O que Mudou

### No Broadcaster (Transmissor):
1. **Heartbeat automático** a cada 30 segundos
2. **Detecção de fechamento** do navegador
3. **Verificação de sessão órfã** ao carregar (>60 min)
4. **Auto-limpeza** quando usuário sai da página

### No Admin (Painel):
1. **Botão "🧹 Limpar Transmissões Órfãs (60m+)"** na aba de Viagens
2. **Status visual** das transmissões:
   - 🟢 **EM ANDAMENTO** - Ativa e recente (<60 min)
   - ⚠️ **ABERTA (60m+)** - Aberta há mais de 60 minutos (problema!)
   - ✅ **FECHADA** - Finalizada normalmente

### No Banco de Dados:
1. **Função automática** `cleanup_stale_transmissions()`
2. **Trigger** de timestamp em `onibus_posicoes`
3. **Coluna** `ultima_atualizacao` em `historico_transmissoes`

---

## 🔍 Como Verificar se Funciona

### Teste 1: Transmissão Normal
1. Inicie uma transmissão no Broadcaster
2. Aguarde 1-2 minutos
3. Verifique no Admin se aparece como "🟢 EM ANDAMENTO"
4. Encerre normalmente
5. Verifique se mudou para "✅ FECHADA"

### Teste 2: Transmissão Abandonada
1. Inicie uma transmissão
2. **Feche o navegador** sem encerrar
3. Aguarde 60+ minutos
4. No Admin, clique em "🧹 Limpar Transmissões Órfãs (60m+)"
5. Verifique se a transmissão foi finalizada

### Teste 3: Verificação Automática (SQL)
Execute no Supabase:
```sql
SELECT cleanup_stale_transmissions();
```

---

## 📊 Monitoramento

### Ver Transmissões Abertas:
```sql
SELECT 
    id,
    perfil_id,
    linha_nome,
    inicio_em,
    fim_em,
    ultima_atualizacao,
    CASE 
        WHEN fim_em IS NULL AND inicio_em < NOW() - INTERVAL '60 minutes' THEN '⚠️ ÓRFÃ (>60m)'
        WHEN fim_em IS NULL THEN '🟢 ATIVA'
        ELSE '✅ FECHADA'
    END as status
FROM historico_transmissoes
ORDER BY inicio_em DESC;
```

### Ver Posições Órfãs:
```sql
SELECT 
    id,
    linha_nome,
    ultima_atualizacao,
    AGE(NOW(), ultima_atualizacao) as tempo_desde_atualizacao
FROM onibus_posicoes
WHERE ultima_atualizacao < NOW() - INTERVAL '60 minutes'
ORDER BY ultima_atualizacao ASC;
```

---

## ⚙️ Configurações Avançadas

### Mudar Tempo Limite de Órfão (padrão: 60 minutos)
Edite `fix_transmissoes_orfas.sql`:
```sql
-- Altere esta linha para outro valor:
AND inicio_em < NOW() - INTERVAL '60 minutes';
-- Exemplo para 2 horas:
AND inicio_em < NOW() - INTERVAL '2 hours';
```

### Criar Job Automático de Limpeza (Supabase Edge Functions)
Para limpeza automática sem intervenção manual, crie uma Edge Function que roda a cada hora:
```javascript
// Supabase Edge Function (opcional)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const { error } = await supabase.rpc('cleanup_stale_transmissions')
if (error) console.error('Erro na limpeza:', error)
```

---

## 🐛 Resolução de Problemas

### BUG IDENTIFICADO: Timer de 60 minutos não funcionava
**Problema antigo**: O `setTimeout(MAX_TRIP_MS)` de 60 minutos morria se o usuário fechasse o navegador.

**Solução**: Agora existe verificação **no servidor** ao carregar o Broadcaster. Se o usuário voltar e existir uma sessão aberta há >60 min, ela é finalizada automaticamente.

### Erro: "column ultima_atualizacao does not exist"
Execute:
```sql
ALTER TABLE historico_transmissoes
ADD COLUMN IF NOT EXISTS ultima_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

### Transmissão ainda aparece como "ABERTA" após limpeza
Verifique se o SQL foi executado corretamente. Execute novamente:
```sql
SELECT cleanup_stale_transmissions();
```

### Heartbeat não está funcionando
1. Verifique o console do navegador por erros
2. Verifique se a coluna `ultima_atualizacao` existe
3. Recarregue a página do Broadcaster

---

## 📝 Notas Importantes

- ✅ A limpeza é **segura**: só afeta transmissões com >60 minutos
- ✅ Usuários **não são afetados**: apenas transmissões abandonadas
- ✅ Pontos **não são perdidos**: transmissões órfãs recebem 0 pontos
- ✅ Histórico **mantido**: transmissões ficam no banco, apenas são finalizadas
- ✅ Verificação **independente do navegador**: funciona mesmo se usuário fechar o app

---

**Última atualização**: 11 de abril de 2026
**Versão**: 1.0.0
