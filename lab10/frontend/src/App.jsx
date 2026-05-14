// Лабораторная работа №10 — M/M/c с усложнениями
//
// Параметры:
//   λ  — интенсивность входного потока
//   μ  — интенсивность обслуживания (на прибор)
//   c  — число приборов
//   K  — ёмкость системы (0 = ∞)
//   α  — интенсивность нетерпения (0 = без нетерпения)
//
// Усложнения: ограничение ёмкости (отказ) + нетерпение заявок (abandonment)
// Теория: формулы Эрланга-B и Эрланга-C

import { useState } from 'react'
import {
  MantineProvider, Container, Title, Text, Stack, Card, Table,
  Button, Grid, Badge, Group, Tabs, Code, Loader, Center,
  Paper, ScrollArea, Divider, NumberInput, Alert, Switch,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import './App.css'

const fmt = (v, d = 4) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—')
const pct = (v) => (typeof v === 'number' && isFinite(v) ? (v * 100).toFixed(2) + '%' : '—')

// ─── Панель параметров ────────────────────────────────────────────────────────

function ParamPanel({ params, setParams, onRun, loading }) {
  const rho = params.mu > 0 && params.c > 0 ? params.lambda / (params.c * params.mu) : Infinity
  const stable = rho < 1

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Параметры M/M/c</Title>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="λ — интенсивность потока"
              value={params.lambda}
              onChange={v => setParams(p => ({ ...p, lambda: v }))}
              min={0.1} max={200} step={0.5} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="μ — интенсивность обслуживания (прибор)"
              value={params.mu}
              onChange={v => setParams(p => ({ ...p, mu: v }))}
              min={0.1} max={200} step={0.5} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="c — число приборов"
              value={params.c}
              onChange={v => setParams(p => ({ ...p, c: v }))}
              min={1} max={50} step={1}
            />
          </Grid.Col>
        </Grid>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="K — ёмкость системы (0 = ∞)"
              description="Усложнение 1: отказ при заполнении"
              value={params.k}
              onChange={v => setParams(p => ({ ...p, k: v ?? 0 }))}
              min={0} max={1000} step={1}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="α — интенсивность нетерпения (0 = нет)"
              description="Усложнение 2: заявки ждут ~ Exp(α)"
              value={params.alpha}
              onChange={v => setParams(p => ({ ...p, alpha: v ?? 0 }))}
              min={0} max={100} step={0.1} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="T — время моделирования"
              value={params.t}
              onChange={v => setParams(p => ({ ...p, t: v }))}
              min={100} max={1000000} step={500}
            />
          </Grid.Col>
        </Grid>

        <Group>
          <Button onClick={onRun} loading={loading} size="md">
            Запустить симуляцию
          </Button>
          <Badge size="lg" color={stable ? 'green' : 'red'} variant={stable ? 'outline' : 'filled'}>
            ρ = λ/(c·μ) = {fmt(rho, 3)} {stable ? '< 1 ✓' : '≥ 1 — нагрузка!'}
          </Badge>
          <Badge size="lg" variant="outline" color="blue">
            a = λ/μ = {fmt(params.lambda / params.mu, 2)} Эрл.
          </Badge>
        </Group>

        <Group gap="xl">
          <Badge size="md" color={params.k > 0 ? 'teal' : 'gray'} variant="light">
            Усложнение 1: ограничение ёмкости {params.k > 0 ? `K = ${params.k}` : '(отключено)'}
          </Badge>
          <Badge size="md" color={params.alpha > 0 ? 'violet' : 'gray'} variant="light">
            Усложнение 2: нетерпение α = {params.alpha > 0 ? params.alpha : 'нет'}
          </Badge>
        </Group>
      </Stack>
    </Card>
  )
}

// ─── Динамика очереди ────────────────────────────────────────────────────────

function QueueDynamicsSection({ data }) {
  const chartData = data.queueOverTime.map(p => ({
    t: parseFloat(p.time.toFixed(2)),
    'В системе': p.nInSys,
    'В очереди': p.qLen,
    'Занято приборов': p.busy,
  }))

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="sm">
        <Title order={3}>Динамика очереди и загрузки приборов</Title>
        <Text size="sm" c="dimmed">
          N(t) — число в системе, Q(t) — в очереди, B(t) — занято приборов из {data.c}.
          Теор. L = {fmt(data.theoL, 3)}, Lq = {fmt(data.theoLq, 3)}.
        </Text>

        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 8, right: 20, bottom: 24, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickCount={8}
              label={{ value: 'Время', position: 'insideBottom', offset: -12, fontSize: 12 }}
            />
            <YAxis label={{ value: 'Заявок', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <Tooltip />
            <Legend verticalAlign="top" />
            <ReferenceLine
              y={data.theoL}
              stroke="#f03e3e"
              strokeDasharray="6 3"
              label={{ value: `L=${fmt(data.theoL,2)}`, fontSize: 10 }}
            />
            <ReferenceLine y={data.c} stroke="#2f9e44" strokeDasharray="4 4"
              label={{ value: `c=${data.c}`, position: 'right', fontSize: 10 }}
            />
            <Area type="stepAfter" dataKey="В системе"    stroke="#339AF0" fill="#339AF022" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Area type="stepAfter" dataKey="В очереди"    stroke="#F76707" fill="#F7670722" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Area type="stepAfter" dataKey="Занято приборов" stroke="#2f9e44" fill="#2f9e4422" strokeWidth={1} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Stack>
    </Card>
  )
}

// ─── Потери и нетерпение ─────────────────────────────────────────────────────

function LossSection({ data }) {
  const hasK = data.k > 0
  const hasAlpha = data.alpha > 0

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Потери: отказы и нетерпение</Title>

        <Grid gutter="md">
          {/* Счётчики */}
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Поступило</Text>
              <Title order={3}>{data.totalArrived.toLocaleString()}</Title>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Обслужено</Text>
              <Title order={3} c="green">{data.totalServed.toLocaleString()}</Title>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Отказы (ёмкость)</Text>
              <Title order={3} c={data.totalRejected > 0 ? 'red' : 'gray'}>
                {data.totalRejected.toLocaleString()}
              </Title>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 6, sm: 3 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Ушли (нетерпение)</Text>
              <Title order={3} c={data.totalAbandoned > 0 ? 'orange' : 'gray'}>
                {data.totalAbandoned.toLocaleString()}
              </Title>
            </Paper>
          </Grid.Col>
        </Grid>

        {/* Диаграмма долей */}
        {data.totalArrived > 0 && (
          <BarChart
            h={180}
            data={[{
              label: 'Заявки',
              'Обслужено': parseFloat((data.totalServed / data.totalArrived * 100).toFixed(2)),
              'Отказы': parseFloat((data.totalRejected / data.totalArrived * 100).toFixed(2)),
              'Нетерпение': parseFloat((data.totalAbandoned / data.totalArrived * 100).toFixed(2)),
            }]}
            dataKey="label"
            series={[
              { name: 'Обслужено', color: 'green.5' },
              { name: 'Отказы', color: 'red.5' },
              { name: 'Нетерпение', color: 'orange.5' },
            ]}
            type="stacked"
            withLegend
            legendProps={{ verticalAlign: 'top' }}
            yAxisProps={{ domain: [0, 100], tickCount: 6 }}
            yAxisLabel="%"
          />
        )}

        <Divider label="Вероятности потерь" labelPosition="center" />

        <Table withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Событие</Table.Th>
              <Table.Th>Эмп. вероятность</Table.Th>
              <Table.Th>Теория</Table.Th>
              <Table.Th>Условие</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td fw={600}>Отказ (переполнение K)</Table.Td>
              <Table.Td>
                <Badge color={data.empRejectionProb > 0.1 ? 'red' : 'green'} variant="light">
                  {pct(data.empRejectionProb)}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Code>{hasK ? '—' : `Erlang-B ≈ ${fmt(data.theoErlangB, 4)}`}</Code>
              </Table.Td>
              <Table.Td>{hasK ? `K = ${data.k}` : 'K = ∞'}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={600}>Нетерпение (abandonment)</Table.Td>
              <Table.Td>
                <Badge color={data.empAbandonProb > 0.1 ? 'orange' : 'green'} variant="light">
                  {pct(data.empAbandonProb)}
                </Badge>
              </Table.Td>
              <Table.Td><Code>—</Code></Table.Td>
              <Table.Td>{hasAlpha ? `α = ${data.alpha}` : 'α = 0 (нет)'}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Stack>
    </Card>
  )
}

// ─── Гистограмма времени ожидания ─────────────────────────────────────────────

function WaitHistSection({ data }) {
  const wData = (data.waitHistogram || []).map(b => ({
    bin: `${fmt(b.lo, 2)}–${fmt(b.hi, 2)}`,
    'Wq': parseFloat(b.freq.toFixed(4)),
  }))

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="sm">
        <Title order={3}>Гистограмма времени ожидания Wq</Title>
        <Text size="sm" c="dimmed">
          Эмпирическое распределение времени ожидания обслуженных заявок.
          Теор. Wq = {fmt(data.theoWq, 4)}, W = {fmt(data.theoW, 4)}.
        </Text>
        <BarChart
          h={260}
          data={wData}
          dataKey="bin"
          series={[{ name: 'Wq', color: 'blue.5' }]}
          withTooltip
          yAxisProps={{ tickCount: 6 }}
          xAxisLabel="Время ожидания"
          yAxisLabel="Частота"
        />
      </Stack>
    </Card>
  )
}

// ─── Статистика M/M/c теория vs эксперимент ──────────────────────────────────

function StatsSection({ data }) {
  const rows = [
    { label: 'L — среднее в системе',           theo: data.theoL,     emp: data.empL },
    { label: 'Lq — среднее в очереди',           theo: data.theoLq,    emp: data.empLq },
    { label: 'W — среднее время пребывания',     theo: data.theoW,     emp: data.empW },
    { label: 'Wq — среднее время ожидания',      theo: data.theoWq,    emp: data.empWq },
    { label: 'ρ — загрузка 1 прибора',           theo: data.rho,       emp: data.empUtilization },
  ]

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Теория M/M/c vs Эксперимент</Title>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Paper withBorder p="md" radius="md" bg="blue.0">
              <Text fw={600} size="sm" mb="xs">Эрланг-C: P(ожидание)</Text>
              <Title order={3}>{fmt(data.theoErlangC, 4)}</Title>
              <Text size="xs" c="dimmed">
                Вероятность, что заявка встанет в очередь (M/M/c без K).
              </Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Paper withBorder p="md" radius="md" bg="orange.0">
              <Text fw={600} size="sm" mb="xs">Эрланг-B: P(отказа) при c=c/c</Text>
              <Title order={3}>{fmt(data.theoErlangB, 4)}</Title>
              <Text size="xs" c="dimmed">
                P(потеря) для M/M/c/c (все приборы = ёмкость), a = {fmt(data.a, 2)} Эрл.
              </Text>
            </Paper>
          </Grid.Col>
        </Grid>

        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Характеристика</Table.Th>
                <Table.Th>Теория M/M/c</Table.Th>
                <Table.Th>Эксперимент</Table.Th>
                <Table.Th>Относит. погрешн.</Table.Th>
                <Table.Th>Заметка</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(row => {
                const relErr = row.theo !== 0 ? Math.abs(row.emp - row.theo) / Math.abs(row.theo) : 0
                return (
                  <Table.Tr key={row.label}>
                    <Table.Td fw={600}>{row.label}</Table.Td>
                    <Table.Td>
                      <Code>{data.stable ? fmt(row.theo, 4) : '∞ (нестаб.)'}</Code>
                    </Table.Td>
                    <Table.Td><Code>{fmt(row.emp, 4)}</Code></Table.Td>
                    <Table.Td>
                      {data.stable ? (
                        <Badge
                          color={relErr < 0.05 ? 'green' : relErr < 0.15 ? 'yellow' : 'red'}
                          variant="light"
                        >
                          {(relErr * 100).toFixed(2)}%
                        </Badge>
                      ) : <Text size="xs" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {(data.k > 0 || data.alpha > 0) ? 'с усложн.' : 'без усложн.'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Divider label="Формулы M/M/c (Эрланг-C)" labelPosition="center" />
        <Paper withBorder p="md" radius="md" bg="gray.0">
          <Code block fz={11}>{[
            `a = λ/μ = ${data.lambda}/${data.mu} = ${fmt(data.a, 4)} Эрл.`,
            `ρ = a/c = ${fmt(data.a, 4)}/${data.c} = ${fmt(data.rho, 4)}`,
            `C(c,a) = Erlang-C = ${fmt(data.theoErlangC, 4)}  (P(ожидание))`,
            `B(c,a) = Erlang-B = ${fmt(data.theoErlangB, 4)}  (P(отказа) при K=c)`,
            `Lq = C(c,a) · ρ / (1−ρ) = ${fmt(data.theoLq, 4)}`,
            `Wq = Lq / λ = ${fmt(data.theoWq, 4)}`,
            `W  = Wq + 1/μ = ${fmt(data.theoW, 4)}`,
            `L  = λ · W = ${fmt(data.theoL, 4)}`,
          ].join('\n')}</Code>
        </Paper>
      </Stack>
    </Card>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function App() {
  const [params, setParams] = useState({ lambda: 4, mu: 2, c: 3, k: 15, alpha: 0.5, t: 1000 })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        lambda: params.lambda ?? 4,
        mu: params.mu ?? 2,
        c: params.c ?? 3,
        k: params.k ?? 0,
        alpha: params.alpha ?? 0,
        t: params.t ?? 1000,
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
            <Title order={1}>Лаб. №10 — M/M/c с усложнениями</Title>
            <Text c="dimmed" size="sm">
              Многоканальная СМО с двумя усложнениями: ограничение ёмкости K (отказ при переполнении)
              и нетерпение заявок (abandonment). Теория: Эрланг-C и Эрланг-B.
            </Text>
          </div>

          <ParamPanel params={params} setParams={setParams} onRun={run} loading={loading} />

          {error && (
            <Alert color="red" title="Ошибка">
              {error} — убедитесь, что сервер запущен на порту 8090.
            </Alert>
          )}

          {loading && (
            <Center py="xl">
              <Loader size="lg" />
            </Center>
          )}

          {data && !loading && (
            <Tabs defaultValue="queue" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="queue">Динамика очереди</Tabs.Tab>
                <Tabs.Tab value="loss">Потери и нетерпение</Tabs.Tab>
                <Tabs.Tab value="wait">Время ожидания</Tabs.Tab>
                <Tabs.Tab value="stats">Статистика и теория</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="queue" pt="md">
                <QueueDynamicsSection data={data} />
              </Tabs.Panel>

              <Tabs.Panel value="loss" pt="md">
                <LossSection data={data} />
              </Tabs.Panel>

              <Tabs.Panel value="wait" pt="md">
                <WaitHistSection data={data} />
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
