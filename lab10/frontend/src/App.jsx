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
              onChange={v => setParams(p => ({ ...p, lambda: v || 0.1 }))}
              min={0.1} max={200} step={0.5} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="μ — интенсивность обслуживания (прибор)"
              value={params.mu}
              onChange={v => setParams(p => ({ ...p, mu: v || 0.1 }))}
              min={0.1} max={200} step={0.5} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="c — число приборов"
              value={params.c}
              onChange={v => setParams(p => ({ ...p, c: v || 1 }))}
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
              onChange={v => setParams(p => ({ ...p, t: v || 100 }))}
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
              <Table.Td>{hasK ? `K = ${data.k}` : 'K = ∞'}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td fw={600}>Нетерпение (abandonment)</Table.Td>
              <Table.Td>
                <Badge color={data.empAbandonProb > 0.1 ? 'orange' : 'green'} variant="light">
                  {pct(data.empAbandonProb)}
                </Badge>
              </Table.Td>
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

// ─── Статистика эксперимента ─────────────────────────────────────────────────

function StatsSection({ data }) {
  const rows = [
    { label: 'L — среднее в системе',       value: data.empL },
    { label: 'Lq — среднее в очереди',      value: data.empLq },
    { label: 'W — среднее время пребывания', value: data.empW },
    { label: 'Wq — среднее время ожидания', value: data.empWq },
    { label: 'Загрузка 1 прибора',          value: data.empUtilization },
  ]

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Экспериментальные показатели</Title>

        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Характеристика</Table.Th>
                <Table.Th>Эксперимент</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(row => {
                return (
                  <Table.Tr key={row.label}>
                    <Table.Td fw={600}>{row.label}</Table.Td>
                    <Table.Td>
                      <Code>{row.label === 'Загрузка 1 прибора' ? pct(row.value) : fmt(row.value, 4)}</Code>
                    </Table.Td>
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
        lambda: params.lambda,
        mu: params.mu,
        c: params.c,
        k: params.k,
        alpha: params.alpha,
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
            <Title order={1}>Лаб. №10 — M/M/c с усложнениями</Title>
            <Text c="dimmed" size="sm">
              Многоканальная СМО с двумя усложнениями: ограничение ёмкости K (отказ при переполнении)
              и нетерпение заявок (abandonment).
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
                <Tabs.Tab value="stats">Статистика эксперимента</Tabs.Tab>
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
