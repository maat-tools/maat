# Connascence of Algorithm (CoA) — Padrões Detectáveis

## O que é

CoA ocorre quando duas ou mais partes do código dependem de uma mesma decisão computacional que **não está representada como uma abstração compartilhada**. Mudar essa decisão em um lugar exige mudar em todos os outros, senão o sistema quebra.

---

## Tipo A: CoA Técnico (detectável por AST)

**Definição:** O mesmo literal, operação ou formato aparece em múltiplas funções que operam sobre o mesmo conceito, sem compartilharem uma constante ou função utilitária.

**Como detectar:** O collector-ts já tem os fatos do AST. Basta uma rule agrupar por literais e padrões.

**Padrões:**

| Padrão | Exemplo | Invariante compartilhada |
|--------|---------|--------------------------|
| **Hash/Verify** | `createHash('sha256')` e `createHash('sha256')` | Algoritmo `'sha256'` |
| **Pack/Unpack** | `.join('\|')` e `.split('\|')` | Delimitador `'\|'` |
| **Encode/Decode** | `JSON.stringify` e `JSON.parse` | Formato JSON |
| **Write/Read** | `writeFile(path, 'utf-8')` e `readFile(path, 'utf-8')` | Encoding `'utf-8'` |
| **Regex duplicada** | `/^[^\s@]+@[^\s@]+$/` em 3 arquivos | Mesma regex |
| **Template literal ↔ Split** | `` `${a}:${b}` `` e `split(':')` | Separador `':'` |

**Regra de ouro:** Se a função A usa o literal `X` para transformar dados, e a função B usa o mesmo literal `X` para reverter ou depender dessa transformação, e não existe uma constante `X` compartilhada entre elas -> CoA Técnico.

---

## Tipo B: CoA Semântico (detectável com LLM no collector)

**Definição:** A mesma regra de negócio ou invariante algorítmica está implementada de formas diferentes em lugares diferentes. Não há literal compartilhado. O que compartilham é o **significado**, não a sintaxe.

**Como detectar:** Um collector semântico independente analisa funções exportadas com LLM e produz tags semânticas. A rule agrupa por tags e detecta quando múltiplas funções implementam a mesma regra sem compartilhar abstração.

**Padrões:**

| Padrão | Exemplo | Invariante compartilhada |
|--------|---------|--------------------------|
| **Validação espalhada** | `if (!email.includes('@'))` e `/^...$/.test(email)` | "O que é um email válido" |
| **Desconto/VIP** | `if (user.tier === 'premium') return *0.9` e `if (status === 'VIP') return -10%` | "Cliente especial tem 10% off" |
| **Ordenação assumida** | `ORDER BY last_name` no DB e `.map(u => u.last_name)` no frontend | "Dados vêm ordenados por sobrenome" |
| **Paginação implícita** | `.limit(20)` no backend e `fetch(/api?page=${n})` no frontend | "Page size é 20" |
| **Formato de resposta** | `res.json({ status: 'ok', data: x })` e `r.data` no cliente | "Resposta tem campo `data`" |
| **Mapeamento de estados** | `{ total: order.valor_total }` em 2 lugares | "Backend legado usa `valor_total`" |

**Regra de ouro:** Se múltiplas funções implementam a mesma regra de negócio (mesmo domínio, mesma ação), mas cada uma faz do seu jeito, e não importam uma função utilitária comum -> CoA Semântico.

---

## Quando usar cada um

| | CoA Técnico (A) | CoA Semântico (B) |
|--|-----------------|-------------------|
| **Custo** | Grátis (AST puro) | Pago (LLM API) |
| **Velocidade** | Instantâneo | Minutos |
| **Cobertura** | Hash, encoding, delimitador, formato | Regras de negócio, validação espalhada, protocolo implícito |
| **Configuração** | Sempre ligado | Opcional, ativa por config |
| **Exemplo prático** | "Mudei sha256 pra sha512 e esqueci do verify" | "Mudei regra de desconto e esqueci da API mobile" |

---

## Estratégia do Maat: Determinismo vs. Heurística

O Maat é construído sobre o princípio de que **rules são determinísticas**. Dados os mesmos fatos, a `evaluate` sempre produz os mesmos findings. Isso torna o Maat confiável, auditable e testável.

Porém, CoA Semântico (Tipo B) requer interpretação de significado — algo que um AST puro não consegue fazer. Para isso, introduzimos **coletores semânticos que podem usar LLM**.

Isso cria uma tensão: o LLM é probabilístico. O mesmo código, mesma versão do modelo, pode gerar tags diferentes entre runs (temperatura, mudança de context window, updates do modelo).

### Solução: Separação por confiança

| Aspecto | CoA Técnico (A) | CoA Semântico (B) |
|---------|-----------------|-------------------|
| **Coletor** | `collector-ts` (AST puro) | Coletor semântico opcional (pode usar LLM) |
| **Determinismo** | 100% determinístico | O coletor é probabilístico; a rule ainda é determinística |
| **Marcação** | `confidence: 'observed'` | `confidence: 'heuristic'` |
| **Uso em CI** | Pode falhar builds | **Nunca** bloqueia builds; sempre é warning |
| **Requer validação** | Não | **Sim** — findings devem ser revisados por humano |
| **Ativação** | Sempre ligado | Opt-in por configuração |

### Regra de ouro do Maat

> **Findings que foram "contaminados" por LLM em qualquer etapa do pipeline são marcados como heurísticos e devem ser validados por um humano.**

Isso preserva o argumento do Maat: o sistema é confiável onde promete ser. Quando o usuário opta pelo modo avançado, ele é informado de que está entrando em território heurístico — útil, mas não infalível.

---

## Nota importante sobre o que CoA NÃO é

- **Não é CoN:** Não é sobre nomes de propriedades ou variáveis.
- **Não é CoP:** Não é sobre posição de argumentos ou índices de array.
- **Não é CoM:** Não é sobre constantes literais compartilhadas (ex: `"ADMIN"`).
- **Não é CoD:** Não é sobre cópia exata de código. CoA é sobre invariantes implícitas, não sobre duplicação sintática.
