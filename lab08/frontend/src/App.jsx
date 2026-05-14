// Лабораторная работа №8 — Пуассоновский поток (события на сервере)
//
// Пуассоновский поток с интенсивностью λ: τ_k ~ Exp(λ), N(T) ~ Poisson(λT)
// Метод генерации: U ~ U(0,1), τ = −ln(U)/λ  (инверсный метод)

import { useState } from 'react'
import {
  MantineProvider, Container, Title, Text, Stack, Card, Table,
  Button, Grid, Badge, Group, Tabs, Code, Loader, Center,
  Paper, ScrollArea, Divider, NumberInput, Alert,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Line, LineChart, Legend,
} from 'recharts'
import './App.css'

// ─── Утилиты ──────────────────────────────────────────────────────────────────

const fmt = (v, d = 4) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—')

// ─── Панель параметров ────────────────────────────────────────────────────────

function ParamPanel({ params, setParams, onRun, loading }) {
  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Параметры симуляции</Title>
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="Интенсивность λ (заявок/ед. вр.)"
              description="Среднее число заявок в единицу времени"
              value={params.lambda}
              onChange={v => setParams(p => ({ ...p, lambda: v || 1 }))}
              min={0.1} max={100} step={0.5} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="Интервал T (ед. вр.)"
              description="Длительность наблюдения"
              value={params.t}
              onChange={v => setParams(p => ({ ...p, t: v || 1 }))}
              min={1} max={1000} step={1}
            />
          </Grid.Col>

        </Grid>

        <Group>
          <Button onClick={onRun} loading={loading} size="md">
            Запустить симуляцию
          </Button>
          <Badge size="lg" variant="outline" color="blue">
            Теор. E[N] = λT = {fmt(params.lambda * params.t, 2)}
          </Badge>
          <Badge size="lg" variant="outline" color="grape">
            Теор. Var[N] = λT = {fmt(params.lambda * params.t, 2)}
          </Badge>
        </Group>
      </Stack>
    </Card>
  )
}

// ─── Одна реализация: временна́я шкала поступлений ────────────────────────────

function TimelineSection({ data }) {
  const { arrivals, t } = data

  // Построим данные для LineChart — ступенчатая функция N(t)
  const stepData = [{ t: 0, n: 0 }]
  arrivals.forEach((at, i) => {
    stepData.push({ t: parseFloat(at.toFixed(4)), n: i + 1 })
  })
  if (arrivals.length > 0) {
    stepData.push({ t, n: arrivals.length })
  }

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="sm">
        <Title order={3}>Одна реализация: процесс поступлений N(t)</Title>
        <Text size="sm" c="dimmed">
          Ступенчатая функция числа заявок от времени. Скачок = одна заявка.
          Всего заявок: <b>{arrivals.length}</b> за T = {t}.
        </Text>

        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={stepData} margin={{ top: 8, right: 16, bottom: 24, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, t]}
              tickCount={10}
              label={{ value: 'Время t', position: 'insideBottom', offset: -12, fontSize: 12 }}
            />
            <YAxis
              label={{ value: 'N(t)', angle: -90, position: 'insideLeft', fontSize: 12 }}
            />
            <Tooltip formatter={(v, name) => [v, name === 'n' ? 'N(t)' : name]} />
            <ReferenceLine
              y={data.lambda * t}
              stroke="#f03e3e"
              strokeDasharray="6 3"
              label={{ value: `E[N]=λT=${fmt(data.lambda * t, 1)}`, position: 'right', fontSize: 11 }}
            />
            <Line
              type="stepAfter"
              dataKey="n"
              stroke="#339AF0"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="N(t)"
            />
          </LineChart>
        </ResponsiveContainer>

        <Paper withBorder p="xs" radius="md" bg="blue.0">
          <Group gap="xl">
            <Text size="sm"><b>Заявок в реализации:</b> {arrivals.length}</Text>
            <Text size="sm"><b>E[N] = λT =</b> {fmt(data.lambda * data.t, 2)}</Text>
            <Text size="sm"><b>Первая заявка:</b> {arrivals.length > 0 ? fmt(arrivals[0], 4) : '—'}</Text>
            <Text size="sm"><b>Последняя:</b> {arrivals.length > 0 ? fmt(arrivals[arrivals.length - 1], 4) : '—'}</Text>
          </Group>
        </Paper>
      </Stack>
    </Card>
  )
}

// ─── Распределение числа заявок ───────────────────────────────────────────────

function DistributionSection({ data }) {
  const { histogram, realizations } = data

  const barData = histogram.map(b => ({
    k: b.k,
    'Эмп.': parseFloat(b.empFreq.toFixed(5)),
    'Теор.': parseFloat(b.theoProb.toFixed(5)),
  }))

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Распределение числа заявок N(T)</Title>
        <Text size="sm" c="dimmed">
          Синие столбцы — эмпирические частоты по {realizations} прогонам,
          оранжевые — теоретические Poisson(λT).
        </Text>

        <BarChart
          h={280}
          data={barData}
          dataKey="k"
          series={[
            { name: 'Эмп.', color: 'blue.5' },
            { name: 'Теор.', color: 'orange.5' },
          ]}
          withLegend
          legendProps={{ verticalAlign: 'top' }}
          xAxisLabel="k (число заявок)"
          yAxisLabel="Вероятность"
          yAxisProps={{ tickCount: 6 }}
        />

        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>k</Table.Th>
                <Table.Th>Наблюдений</Table.Th>
                <Table.Th>P̂(N=k)</Table.Th>
                <Table.Th>P(N=k) Poisson</Table.Th>
                <Table.Th>|P̂ − P|</Table.Th>
                <Table.Th>Ожид. E_k</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {histogram.map(b => {
                const diff = Math.abs(b.empFreq - b.theoProb)
                return (
                  <Table.Tr key={b.k}>
                    <Table.Td fw={600}>{b.k}</Table.Td>
                    <Table.Td><Code>{b.count}</Code></Table.Td>
                    <Table.Td><Code>{fmt(b.empFreq, 4)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(b.theoProb, 4)}</Code></Table.Td>
                    <Table.Td>
                      <Code style={{ color: diff > 0.02 ? '#e03131' : '#2f9e44' }}>
                        {fmt(diff, 4)}
                      </Code>
                    </Table.Td>
                    <Table.Td><Code>{fmt(b.theoFreq, 1)}</Code></Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    </Card>
  )
}

// ─── Статистика ───────────────────────────────────────────────────────────────

function StatsSection({ data }) {
  const { empMean, empVariance, theoMean, theoVariance, chi2, chi2Crit, chi2Pass, chi2DF } = data
  const rows = [
    { label: 'E[N(T)] = λT',   theo: theoMean,     emp: empMean },
    { label: 'Var[N(T)] = λT', theo: theoVariance,  emp: empVariance },
    { label: 'SD[N(T)] = √(λT)', theo: Math.sqrt(theoVariance), emp: Math.sqrt(empVariance) },
  ]

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Статистическая проверка</Title>

        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Характеристика</Table.Th>
                <Table.Th>Теоретическое</Table.Th>
                <Table.Th>Эмпирическое</Table.Th>
                <Table.Th>Относит. погрешность</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(row => {
                const relErr = row.theo !== 0 ? Math.abs(row.emp - row.theo) / row.theo : 0
                return (
                  <Table.Tr key={row.label}>
                    <Table.Td fw={600}>{row.label}</Table.Td>
                    <Table.Td><Code>{fmt(row.theo, 4)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(row.emp, 4)}</Code></Table.Td>
                    <Table.Td>
                      <Badge color={relErr < 0.05 ? 'green' : relErr < 0.1 ? 'yellow' : 'red'} variant="light">
                        {(relErr * 100).toFixed(2)}%
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Divider label="Критерий χ² (H₀: N(T) ~ Poisson(λT), α = 0.05)" labelPosition="center" />

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Paper withBorder p="md" radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Статистика χ²:</Text>
                  <Code fw={600}>{fmt(chi2, 4)}</Code>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Критическое χ²_({chi2DF}, 0.05):</Text>
                  <Code>{fmt(chi2Crit, 3)}</Code>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Степени свободы ν:</Text>
                  <Code>{chi2DF}</Code>
                </Group>
                <Divider />
                <Badge
                  size="xl"
                  color={chi2Pass ? 'green' : 'red'}
                  variant="filled"
                  fullWidth
                  ta="center"
                >
                  {chi2Pass
                    ? `χ² = ${fmt(chi2,3)} < ${fmt(chi2Crit,3)} → H₀ не отвергается`
                    : `χ² = ${fmt(chi2,3)} ≥ ${fmt(chi2Crit,3)} → H₀ отвергается`}
                </Badge>
              </Stack>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Paper withBorder p="md" radius="md" bg="gray.0">
              <Stack gap="xs">
                <Text size="sm" fw={600}>Алгоритм генерации (инверсный метод):</Text>
                <Code block fz={11}>{[
                  `t ← 0`,
                  `while t ≤ T:`,
                  `  U ~ U(0,1)`,
                  `  t ← t − ln(U) / λ`,
                  `  if t ≤ T: запись заявки`,
                ].join('\n')}</Code>
                <Text size="xs" c="dimmed">
                  τ = −ln(U)/λ ~ Exp(λ) — пуассоновский поток
                </Text>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Stack>
    </Card>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function App() {
  const [params, setParams] = useState({ lambda: 5, t: 10 })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        lambda: params.lambda,
        t: params.t,
      })
      const res = await fetch(`/api/simulate?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <MantineProvider>
      <Container size="xl" py="xl">
        <Stack gap="lg">
          <div>
            <Title order={1}>Лаб. №8 — Пуассоновский поток</Title>
            <Text c="dimmed" size="sm">
              Моделирование потока заявок на сервер. Интервалы между заявками τ ~ Exp(λ),
              число заявок за T: N(T) ~ Poisson(λT).
            </Text>
          </div>

          <ParamPanel params={params} setParams={setParams} onRun={run} loading={loading} />

          {error && (
            <Alert color="red" title="Ошибка">
              {error} — убедитесь, что сервер запущен на порту 8088.
            </Alert>
          )}

          {loading && (
            <Center py="xl">
              <Loader size="lg" />
            </Center>
          )}

          {data && !loading && (
            <Tabs defaultValue="timeline" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="timeline">Одна реализация</Tabs.Tab>
                <Tabs.Tab value="distribution">Распределение N(T)</Tabs.Tab>
                <Tabs.Tab value="stats">Статистика и χ²</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="timeline" pt="md">
                <TimelineSection data={data} />
              </Tabs.Panel>

              <Tabs.Panel value="distribution" pt="md">
                <DistributionSection data={data} />
              </Tabs.Panel>

              <Tabs.Panel value="stats" pt="md">
                <StatsSection data={data} />
              </Tabs.Panel>
            </Tabs>
          )}

          {!data && !loading && (
            <Center py="xl">
              <Text c="dimmed">Нажмите «Запустить симуляцию» для получения результатов.</Text>
            </Center>
          )}
        </Stack>
      </Container>
    </MantineProvider>
  )
}
