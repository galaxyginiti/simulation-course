// Лабораторная работа №5 — Моделирование случайных событий
//
// Два инструмента:
//   1. «Да или нет» — бинарное событие с вероятностью p.
//      α ~ U[0,1) — вещественное число, НЕ процент.
//      α < p  → «ДА»;  α ≥ p → «НЕТ».
//   2. «Шар предсказаний» — 10 равновероятных исходов.
//      Выбираем ответ по инверсному методу: ответ i, если CDF[i-1] ≤ α < CDF[i].

import { useState, useCallback } from 'react'
import {
  MantineProvider, Container, Title, Text, Stack, Card, Table,
  Button, Grid, Badge, Group, Divider, Code, Loader, Center,
  Paper, ScrollArea, Tooltip, Slider, NumberInput, Progress,
} from '@mantine/core'
import './App.css'

// ─── Утилиты ─────────────────────────────────────────────────────────────────

const CAT_COLOR = { positive: 'green', neutral: 'yellow', negative: 'red' }
const CAT_LABEL = { positive: 'Позитивный', neutral: 'Нейтральный', negative: 'Негативный' }

// ─── Компонент: значки α ─────────────────────────────────────────────────────
// Каждый α — вещественное число ∈ [0, 1), НЕ процент.
// Синий = «ДА» (α < p); серый = «НЕТ» (α ≥ p).

function AlphaStrip({ items, p }) {
  if (!items || items.length === 0) return null
  return (
    <ScrollArea>
      <Group gap={4} wrap="nowrap" pb={4}>
        {items.map((item, i) => (
          <Tooltip
            key={i}
            label={`α = ${item.alpha.toFixed(6)} ${item.isYes ? '< ' : '≥ '}${p.toFixed(2)} → ${item.isYes ? 'ДА' : 'НЕТ'}`}
            withArrow
          >
            <Badge
              variant={item.isYes ? 'filled' : 'outline'}
              color={item.isYes ? 'blue' : 'gray'}
              size="sm"
              className="mono-badge"
            >
              {item.alpha.toFixed(4)}
            </Badge>
          </Tooltip>
        ))}
      </Group>
    </ScrollArea>
  )
}

// ─── Компонент: шар предсказаний ─────────────────────────────────────────────

function MagicBall({ answer, onClick, loading }) {
  return (
    <div className="magic-ball" onClick={loading ? undefined : onClick}>
      <div className="ball-window">
        {loading
          ? <Loader size="sm" color="blue.3" />
          : <div className="ball-text">
              {answer ? answer.text : '?'}
            </div>
        }
      </div>
    </div>
  )
}

// ─── Часть 1: Да/Нет ─────────────────────────────────────────────────────────

function YesNoSection() {
  const [p, setP]         = useState(0.5)
  const [n, setN]         = useState(100)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/events?p=${p}&n=${n}`)
      setResult(await res.json())
    } finally { setLoading(false) }
  }, [p, n])

  const yesRatio = result ? (result.yesCount / result.n) * 100 : 0

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Часть 1 — «Скажи "Да" или "Нет"»</Title>
        <Text size="sm" c="dimmed">
          Генерируем α ~ U[0,1) и сравниваем с порогом p. α — число, не процент.
          Событие «ДА» наступает если α &lt; p.
        </Text>

        {/* Управление */}
        <Grid gutter="md" align="flex-end">
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <Text size="sm" fw={500} mb={8}>
              Вероятность «ДА»: p = <strong>{p.toFixed(2)}</strong>
            </Text>
            <Slider
              value={p} onChange={setP} min={0} max={1} step={0.01}
              marks={[{value:0,label:'0'},{value:0.5,label:'0.5'},{value:1,label:'1'}]}
              label={(v) => v.toFixed(2)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 3 }}>
            <NumberInput
              label="Число испытаний N"
              value={n} onChange={(v) => setN(Number(v))}
              min={1} max={100000} step={100}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 2 }}>
            <Button onClick={run} loading={loading} fullWidth size="md" mt={20}>
              Пуск
            </Button>
          </Grid.Col>
        </Grid>

        {/* Объяснение */}
        <Paper withBorder p="sm" radius="md" bg="blue.0">
          <Code block fz={12}>{[
            `α ~ U[0,1)  — число из [0,1), НЕ процент`,
            `если α < ${p.toFixed(2)} → «ДА»  (левый отрезок длиной ${p.toFixed(2)})`,
            `если α ≥ ${p.toFixed(2)} → «НЕТ» (правый отрезок длиной ${(1-p).toFixed(2)})`,
          ].join('\n')}</Code>
        </Paper>

        {/* Результаты */}
        {result && (
          <>
            <Grid gutter="md">
              <Grid.Col span={6}>
                <Paper withBorder p="md" radius="md" ta="center">
                  <Text size="xl" fw={900} c="blue.6">{result.yesCount.toLocaleString('ru-RU')}</Text>
                  <Text size="sm" c="dimmed">«ДА» (α &lt; {p.toFixed(2)})</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    P̂(ДА) = {(result.empP).toFixed(4)} | теория: {p.toFixed(4)}
                  </Text>
                </Paper>
              </Grid.Col>
              <Grid.Col span={6}>
                <Paper withBorder p="md" radius="md" ta="center">
                  <Text size="xl" fw={900} c="gray.5">{result.noCount.toLocaleString('ru-RU')}</Text>
                  <Text size="sm" c="dimmed">«НЕТ» (α ≥ {p.toFixed(2)})</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    P̂(НЕТ) = {(1 - result.empP).toFixed(4)} | теория: {(1-p).toFixed(4)}
                  </Text>
                </Paper>
              </Grid.Col>
            </Grid>

            <div>
              <Text size="xs" c="dimmed" mb={6}>
                Соотношение ДА / НЕТ (N = {result.n.toLocaleString('ru-RU')}):
              </Text>
              <Progress.Root size={24} radius="sm">
                <Progress.Section value={yesRatio} color="blue.5">
                  <Progress.Label>{yesRatio.toFixed(1)}%</Progress.Label>
                </Progress.Section>
                <Progress.Section value={100 - yesRatio} color="gray.3">
                  <Progress.Label style={{ color: '#666' }}>{(100-yesRatio).toFixed(1)}%</Progress.Label>
                </Progress.Section>
              </Progress.Root>
            </div>

            <Table withTableBorder withColumnBorders fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Хар-ка</Table.Th>
                  <Table.Th>Эмпирическое</Table.Th>
                  <Table.Th>Теоретическое</Table.Th>
                  <Table.Th>|Δ|</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>P(ДА)</Table.Td>
                  <Table.Td><Code>{result.empP.toFixed(4)}</Code></Table.Td>
                  <Table.Td><Code>{p.toFixed(4)}</Code></Table.Td>
                  <Table.Td><Code>{Math.abs(result.empP - p).toFixed(4)}</Code></Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>P(НЕТ)</Table.Td>
                  <Table.Td><Code>{(1 - result.empP).toFixed(4)}</Code></Table.Td>
                  <Table.Td><Code>{(1 - p).toFixed(4)}</Code></Table.Td>
                  <Table.Td><Code>{Math.abs((1-result.empP) - (1-p)).toFixed(4)}</Code></Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>

            <div>
              <Text size="xs" c="dimmed" mb={4}>
                Последние {result.lastAlpha.length} значений α (синий = ДА, серый = НЕТ):
              </Text>
              <AlphaStrip items={result.lastAlpha} p={p} />
            </div>
          </>
        )}
      </Stack>
    </Card>
  )
}

// ─── Часть 2: Шар предсказаний ───────────────────────────────────────────────

function EightBallSection() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])

  const shake = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/eightball')
      const data = await res.json()
      setResult(data)
      setHistory(prev => [data, ...prev].slice(0, 5))
    } finally { setLoading(false) }
  }, [])

  // Строим CDF для отображения
  const getCDF = (answers) => {
    let cum = 0
    return answers.map(a => { cum += a.p; return cum })
  }

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Часть 2 — Шар предсказаний (Magic 8-Ball)</Title>
        <Text size="sm" c="dimmed">
          10 равновероятных ответов (p=0.1 каждый). Генерируем α ∈ [0,1) и выбираем ответ
          по инверсному методу: ответ i если CDF[i-1] ≤ α &lt; CDF[i].
        </Text>

        <Grid gutter="xl" align="center">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack align="center" gap="md">
              <MagicBall answer={result?.answer} onClick={shake} loading={loading} />
              <Button onClick={shake} loading={loading} size="lg" variant="gradient"
                gradient={{ from: 'violet', to: 'blue' }}>
                Потряси шар
              </Button>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 8 }}>
            {result ? (
              <Stack gap="md">
                {/* Текущий ответ */}
                <Paper withBorder p="md" radius="md">
                  <Group justify="space-between" mb="xs">
                    <Text fw={700} size="lg">«{result.answer.text}»</Text>
                    <Badge color={CAT_COLOR[result.answer.category]} size="lg">
                      {CAT_LABEL[result.answer.category]}
                    </Badge>
                  </Group>
                  <Code block fz={12}>{[
                    `α = ${result.alpha.toFixed(8)}  ← число, не процент`,
                    `Попал в интервал ответа #${result.index+1}:`,
                    `  [${(result.index * result.answer.p).toFixed(1)}, ${((result.index+1) * result.answer.p).toFixed(1)})`,
                    `p(ответа) = ${result.answer.p}`,
                  ].join('\n')}</Code>
                </Paper>

                {/* CDF таблица */}
                <ScrollArea>
                  <Table withTableBorder withColumnBorders fz="xs" miw={400}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>Ответ</Table.Th>
                        <Table.Th>p</Table.Th>
                        <Table.Th>CDF [от, до)</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {result.answers.map((a, i) => {
                        const cdf = getCDF(result.answers)
                        const from = i === 0 ? 0 : cdf[i-1]
                        const isChosen = i === result.index
                        return (
                          <Table.Tr key={i} bg={isChosen ? 'violet.0' : undefined}>
                            <Table.Td fw={isChosen ? 700 : 400}>{i+1}</Table.Td>
                            <Table.Td fw={isChosen ? 700 : 400}>
                              <Group gap={4}>
                                {isChosen && <Badge color="violet" size="xs">←</Badge>}
                                {a.text}
                              </Group>
                            </Table.Td>
                            <Table.Td><Code>{a.p.toFixed(2)}</Code></Table.Td>
                            <Table.Td><Code>[{from.toFixed(2)}, {cdf[i].toFixed(2)})</Code></Table.Td>
                          </Table.Tr>
                        )
                      })}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            ) : (
              <Center h={200}>
                <Text c="dimmed">Потряси шар, чтобы получить предсказание</Text>
              </Center>
            )}
          </Grid.Col>
        </Grid>

        {history.length > 1 && (
          <>
            <Divider label="История предсказаний" labelPosition="center" />
            <Stack gap="xs">
              {history.slice(1).map((h, i) => (
                <Group key={i} gap="sm">
                  <Badge color={CAT_COLOR[h.answer.category]} variant="light" size="sm">
                    {CAT_LABEL[h.answer.category]}
                  </Badge>
                  <Text size="sm">«{h.answer.text}»</Text>
                  <Text size="xs" c="dimmed" className="mono-badge">α={h.alpha.toFixed(4)}</Text>
                </Group>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function App() {
  return (
    <MantineProvider>
      <Container size="lg" py="xl">
        <Stack gap="xl">
          <div>
            <Title order={1}>Лабораторная работа №5</Title>
            <Text c="dimmed" mt={4} size="lg">
              Моделирование случайных событий — датчик U[0,1) как инструмент
            </Text>
          </div>

          <Paper withBorder p="md" radius="md" bg="blue.0">
            <Text size="sm" fw={600} mb={4}>Ключевая идея обеих частей:</Text>
            <Code block fz={12}>{[
              'α ~ U[0, 1)  — базовый датчик. α — вещественное число (float64), НЕ процент.',
              'Пример: α = 0.7314…  Это число «попадает» в определённый интервал [0,1),',
              'что и определяет исход случайного события.',
            ].join('\n')}</Code>
          </Paper>

          <YesNoSection />
          <EightBallSection />

          <Card withBorder shadow="sm" radius="md" padding="lg" bg="gray.0">
            <Title order={3} mb="sm">Выводы</Title>
            <Stack gap="xs">
              <Text size="sm"><strong>1.</strong> Бинарное событие «Да/Нет» с вероятностью p моделируется одним числом α: сравнением с порогом p. При увеличении N эмпирическая вероятность сходится к теоретической.</Text>
              <Text size="sm"><strong>2.</strong> Шар предсказаний демонстрирует инверсный метод: числовая прямая [0,1) делится на отрезки по CDF, α «выбирает» один из них. Все 10 ответов равновероятны (p=0.1).</Text>
              <Text size="sm"><strong>3.</strong> α — вещественное число (float64) ∈ [0,1): например 0.7314…, а не «73.14%». Умножение на 100 даёт проценты, но в алгоритм передаётся именно число.</Text>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </MantineProvider>
  )
}
