# Planeador de Refeições (família)

App instalável nos Android, com plano de 6 dias, 5 refeições por dia, doses por pessoa, lista de compras, avisos para a criança e notificações de descongelação. Custo: 0 €.

## O que precisas (todas as contas são gratuitas)
1. Conta GitHub (aloja a app e corre os avisos automáticos).
2. Conta Supabase (guarda os dados partilhados entre vocês os dois).
3. Conta Gmail com verificação em 2 passos (envia o email de sexta).

## Passo a passo (cerca de 20 minutos)

**1. Supabase**
- Cria um projeto em supabase.com (guarda a palavra-passe da base de dados).
- Abre "SQL Editor", cola o conteúdo de `supabase/schema.sql` e carrega em Run.
- Em Project Settings > API copia o **Project URL** e a chave **anon public**.

**2. GitHub**
- Cria um repositório **público** chamado `planeador` (a app não contém o livro, por isso é seguro).
- Carrega para lá TODO o conteúdo desta pasta (menos a pasta `private`). Confirma que a pasta `.github` ficou lá.
- Abre `public/config.js` no GitHub (ícone do lápis) e preenche `supabaseUrl`, `supabaseKey` e `appUrl` (será `https://O-TEU-UTILIZADOR.github.io/planeador/`). Guarda.
- Settings > Pages > Source: **GitHub Actions**. Espera 1 a 2 minutos e abre o endereço da app.

**3. No telemóvel**
- Abre o endereço no Chrome, menu ⋮ > "Instalar app".
- A app pede o ficheiro `receitas-livro.json` (vai separado, nunca o publiques no GitHub). Escolhe-o. Só é preciso uma vez.
- Em Perfil preenche os dados de cada adulto (os emails são obrigatórios para receberem a lista), o valor calórico da criança e confirma o dia de prep.
- Em Perfil > "Convidar (copiar link)" e envia o link à tua esposa. Ao abrir, fica ligada aos mesmos dados.
- Em Perfil > "Ativar notificações" em cada telemóvel.

**4. Avisos automáticos (GitHub > Settings > Secrets and variables > Actions > New repository secret)**
| Nome | Valor |
|---|---|
| SUPABASE_URL | o Project URL |
| SUPABASE_KEY | a chave anon |
| FAMILY_ID | o "Código da família" que aparece em Perfil |
| SMTP_USER | o teu endereço Gmail |
| SMTP_PASS | palavra-passe de aplicação do Google (myaccount.google.com/apppasswords) |
| VAPID_PUBLIC / VAPID_PRIVATE | do ficheiro `segredos-vapid.txt` |
| APP_URL | o endereço da app |

Teste: GitHub > Actions > "Avisos" > Run workflow, escreve `mail` em "force". Deves receber o email em 1 minuto.

## Como funciona
- **Sexta** (hora configurável): email para os dois com lista de compras, lotes do dia de prep, plano por pessoa e alertas da criança. Se ainda não existir plano para a semana seguinte, é gerado nesse momento.
- **Véspera** (hora configurável): notificação "amanhã descongelar..." e avisos para a criança.
- **Prep**: sábado por defeito (muda em Perfil). Refeições com mais dias do que o frigorífico aguenta passam automaticamente para o congelador.
- **Doses**: cada refeição é escalada ao teu objetivo (Mifflin-St Jeor com défice de 15, 20 ou 25%, mínimos de 1500 kcal homem e 1200 mulher). Atualiza o peso em Perfil e as doses recalculam.

## Limites e honestidade
- O GitHub pode atrasar os agendamentos alguns minutos. O Android com poupança de bateria pode atrasar notificações; o email serve de reserva.
- Os valores nutricionais são os do livro. Há 18 receitas fora do planeador porque o livro não diz quantas unidades rendem; podes editá-las e passam a entrar.
- Dias de frigorífico e congelação são estimativas de segurança alimentar (o livro raramente os indica). Podes editá-los em cada receita.
- Os alertas da criança são regras automáticas por ingrediente (frutos secos, sal, atum, fumados, konjac, picante, etc.) e não substituem o pediatra.
- As receitas 117 e 120 têm macros idênticas no livro; confirma se é gralha.
- O GitHub desativa agendamentos de repositórios parados 60 dias; o workflow tenta reativar-se sozinho. Se deixares de receber avisos, vê o separador Actions.
