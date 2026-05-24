# Roadmap de Escala Brasil: Do Local ao Nacional 🚀

Este documento detalha os passos necessários para transformar o **MeuBusApp** de um aplicativo local em uma plataforma escalável para qualquer cidade ou estado do Brasil.

---

## 📅 Fase 1: Fundação Multi-Cidade (Curto Prazo)
*O objetivo é permitir que o app funcione em mais de uma cidade simultaneamente.*

### 1.1 Reestruturação do Banco de Dados
- **Tabela `regioes`**: Criar uma estrutura de Cidades e Estados no Supabase.
- **IDs de Localização**: Adicionar `cidade_id` em:
  - `linhas`
  - `anuncios`
  - `lojas`
  - `onibus_posicoes` (essencial para filtrar o tráfego em tempo real).
- **RLS Dinâmico**: Atualizar as políticas de segurança para que consultas filtrem automaticamente pela cidade selecionada.

### 1.2 UX e Seleção de Contexto
- **Seletor de Cidade**: Adicionar uma tela de boas-vindas ou um seletor no topo da Home.
- **Geofencing**: Usar a API de Geolocalização do navegador para sugerir a cidade mais próxima automaticamente.
- **Centralização do Mapa**: O `center` do mapa deve vir do banco de dados (latitude/longitude da prefeitura da cidade selecionada).

---

## 🏗️ Fase 2: Branding Dinâmico e Personalização (Médio Prazo)
*O app deve "mudar de cara" dependendo de onde o usuário está.*

### 2.1 Motor de Temas (White Label)
- **Configuração por Cidade**: Salvar no banco o nome da marca (ex: BHBus, RioBus), cores primárias, logos e nomes da moeda (MeuBusCoins, RioCoins).
- **Variables de Estilo**: Migrar o CSS fixo para variáveis CSS (`--primary-color`) que são injetadas em tempo real.

### 2.2 Localização de Conteúdo
- **Feed de Notícias Local**: Adicionar avisos de trânsito ou eventos específicos de cada cidade.
- **Parceiros Regionais**: Sistema para que lojistas de uma cidade não apareçam para usuários de outra.

---

## 💼 Fase 3: Governança e Expansão Comercial (Longo Prazo)
*Gerenciamento de múltiplos administradores e parceiros.*

### 3.1 Painel Admin Multi-Nível
- **Super Admin (Você)**: Acesso total a todas as cidades e estatísticas globais.
- **Admin Regional**: Acesso apenas à sua cidade (Prefeituras ou Operadoras de Ônibus locais).
- **Painel do Lojista**: Interface simplificada para que o dono da loja adicione seus próprios brindes e valide resgates sem sua intervenção.

### 3.2 Monetização Escalável
- **Plataforma de Ads Self-Service**: Permitir que anunciantes comprem espaço no banner diretamente (estilo Google Ads), segmentando por cidade.
- **Marketplace de Dados**: Vender relatórios de densidade de tráfego e pontualidade para órgãos públicos e empresas privadas.

---

## ⚡ Fase 4: Infraestrutura de Alta Performance (Escala Nacional)
*Garantir que o sistema suporte milhões de pings de GPS.*

### 4.1 Otimização de Realtime
- **Canais por Cidade**: Migrar o Supabase Realtime para canais separados por `cidade_id`. Isso evita que um usuário em SP receba atualizações de um ônibus em Minas, economizando bateria e dados.
- **Agregação de Coordenadas**: Implementar "clustering" no mapa para quando houver centenas de ônibus próximos.

### 4.2 Estratégia "Filter-First" (Foco em Performance)
- **Barreira de Entrada**: Impedir o carregamento do mapa antes que o usuário selecione a Linha específica. Isso evita que o cliente tenha que processar milhares de ônibus desnecessários.
- **Consultas Otimizadas**: Garantir que toda requisição de coordenadas ao banco de dados tenha obrigatoriamente filtros de `estado_id`, `cidade_id` e `linha_id`.

### 4.3 Segurança Avançada e Anti-Fraude
- **Validação de GPS**: Refinar o sistema de ganhar pontos para garantir que o usuário realmente está dentro do ônibus (verificando velocidade e trajetória).

---

> [!IMPORTANT]
> **O Grande Diferencial**: O MeuBusApp não é apenas um GPS, é uma **Rede de Incentivo Local**. Para escalar, o segredo é manter a sensação de "comunidade" em cada cidade, mesmo sendo uma plataforma nacional.

> [!TIP]
> **Comece Pequeno**: O próximo teste ideal seria adicionar **Matozinhos** ou **Prudente de Morais** como "cidades piloto" para validar a troca de contexto no app.
