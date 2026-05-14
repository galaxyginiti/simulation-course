// Лабораторная работа №9 — Система массового обслуживания M/M/1
//
// λ — интенсивность входного потока (Exp(λ) интервалы между заявками)
// μ — интенсивность обслуживания (Exp(μ) время обслуживания)
// ρ = λ/μ — коэффициент загрузки (ρ < 1 для устойчивости)
//
// Теоретические формулы M/M/1:
//   P₀=1−ρ,  L=ρ/(1−ρ),  Lq=ρ²/(1−ρ),  W=1/(μ−λ),  Wq=ρ/(μ−λ)

import { useState } from 'react'
import {
  MantineProvider, Container, Title, Text, Stack, Card, Table,
  Button, Grid, Badge, Group, Tabs, Code, Loader, Center,
  Paper, ScrollArea, Divider, NumberInput, Alert, RingProgress,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'

import './App.css'

const fmt = (v, d = 4) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—')

// ─── Панель параметров ────────────────────────────────────────────────────────

function ParamPanel({ params, setParams, onRun, loading }) {
  const rho = params.mu > 0 ? params.lambda / params.mu : Infinity
  const stable = false // M/M/1 всегда устойчива, очереди нет

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Параметры M/M/1</Title>
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="λ — интенсивность входного потока"
              description="Заявок в единицу времени"
              value={params.lambda}
              onChange={v => setParams(p => ({ ...p, lambda: v }))}
              min={0.1} max={100} step={0.5} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="μ — интенсивность обслуживания"
              description="Заявок в единицу времени"
              value={params.mu}
              onChange={v => setParams(p => ({ ...p, mu: v }))}
              min={0.1} max={100} step={0.5} decimalScale={2}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <NumberInput
              label="T — время моделирования"
              description="Единицы времени"
              value={params.t}
              onChange={v => setParams(p => ({ ...p, t: v }))}
              min={100} max={100000} step={100}
            />
          </Grid.Col>
        </Grid>

        <Group>
          <Button onClick={onRun} loading={loading} size="md">
            Запустить симуляцию
          </Button>
          <Badge
            size="lg"
            color="blue"
            variant="outline"
          >
            ρ = λ/μ = {fmt(rho, 3)} | P₀ = {fmt(1/(1+rho), 3)} | P₁ = {fmt(rho/(1+rho), 3)}
          </Badge>
        </Group>

        {!stable && (
          <Alert color="blue" title="Система M/M/1 всегда устойчива">
            Очереди нет — заявка либо попадает на обслуживание, либо получает отказ. Система устойчива при любом ρ.
          </Alert>
        )}
      </Stack>
    </Card>
  )
}

// ─── Распределение вероятностей P(N=k) ───────────────────────────────────────

function ProbDistSection({ data }) {
  const chartData = (data.probDist || []).map(p => ({
    k: String(p.n),
    'Эмпирическая': parseFloat(p.emp.toFixed(4)),
    'Теоретическая': parseFloat(p.theo.toFixed(4)),
  }))

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="sm">
        <Title order={3}>Стационарное распределение P(N = k)</Title>
        <Text size="sm" c="dimmed">
          Вероятность того, что прибор свободен (k=0) или занят (k=1).
          Теор. P₀ = 1/(1+ρ) = {fmt(data.theoP0, 3)}, P₁ = ρ/(1+ρ) = {fmt(data.theoP1, 3)}.
        </Text>
        <BarChart
          h={300}
          data={chartData}
          dataKey="k"
          series={[
            { name: 'Эмпирическая', color: 'blue.5' },
            { name: 'Теоретическая', color: 'red.4' },
          ]}
          withLegend
          legendProps={{ verticalAlign: 'top' }}
          withTooltip
          xAxisLabel="k — число заявок в системе"
          yAxisProps={{ tickCount: 6 }}
        />
      </Stack>
    </Card>
  )
}

// ─── Сравнение теории и практики ─────────────────────────────────────────────

function StatsSection({ data }) {
  const rows = [
    { label: 'L — среднее в системе',         theo: data.theoL,    emp: data.empL },
    { label: 'W — среднее время обслуживания', theo: data.theoW,    emp: data.empW },
    { label: 'ρ — загрузка прибора = P₁',      theo: data.theoP1,   emp: data.empUtilization },
    { label: 'P₀ — вероятность простоя',    theo: data.theoP0,   emp: 1 - data.empUtilization },
    { label: 'Pотк — вероятность отказа',   theo: data.theoP1,   emp: data.empLossProb },
  ]

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Теория vs Эксперимент (M/M/1)</Title>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Поступило</Text>
              <Title order={2} c="gray">{(data.totalArrived ?? 0).toLocaleString()}</Title>
              <Text size="xs" c="dimmed">заявок</Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Обслужено</Text>
              <Title order={2} c="green">{(data.totalServed ?? 0).toLocaleString()}</Title>
              <Text size="xs" c="dimmed">за T = {data.totalTime}</Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Отказано</Text>
              <Title order={2} c="red">{(data.totalRejected ?? 0).toLocaleString()}</Title>
              <Text size="xs" c="dimmed">{((data.empLossProb ?? 0) * 100).toFixed(1)}% от поступивших</Text>
            </Paper>
          </Grid.Col>
        </Grid>

        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Характеристика</Table.Th>
                <Table.Th>Теория M/M/1</Table.Th>
                <Table.Th>Эксперимент</Table.Th>
                <Table.Th>|Δ| абс.</Table.Th>
                <Table.Th>Относит. погрешн.</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(row => {
                const absErr = Math.abs(row.emp - row.theo)
                const relErr = row.theo !== 0 ? absErr / Math.abs(row.theo) : 0
                return (
                  <Table.Tr key={row.label}>
                    <Table.Td fw={600}>{row.label}</Table.Td>
                    <Table.Td><Code>{fmt(row.theo, 4)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(row.emp, 4)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(absErr, 4)}</Code></Table.Td>
                    <Table.Td>
                      <Badge
                        color={relErr < 0.05 ? 'green' : relErr < 0.15 ? 'yellow' : 'red'}
                        variant="light"
                      >
                        {(relErr * 100).toFixed(2)}%
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Divider label="Формулы M/M/1" labelPosition="center" />
        <Paper withBorder p="md" radius="md" bg="gray.0">
          <Code block fz={12}>{[
            `ρ  = λ/μ = ${data.lambda}/${data.mu} = ${fmt(data.rho, 4)}`,
            `P₀ = 1/(1+ρ) = ${fmt(data.theoP0, 4)}  (вероятность простоя)`,
            `P₁ = ρ/(1+ρ) = ${fmt(data.theoP1, 4)}  (вероятность отказа = загрузка)`,
            `L  = P₁ = ${fmt(data.theoL, 4)}`,
            `W  = 1/μ = 1/${data.mu} = ${fmt(data.theoW, 4)}`,
            `λеф = λ·P₀ = ${fmt(data.theoLambdaEf, 4)}  (эффективная интенсивность)`,
          ].join('\n')}</Code>
        </Paper>
      </Stack>
    </Card>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function App() {
  const [params, setParams] = useState({ lambda: 3, mu: 5, t: 500 })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ lambda: params.lambda ?? 3, mu: params.mu ?? 5, t: params.t ?? 500 })
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
            <Title order={1}>Лаб. №9 — Система M/M/1</Title>
            <Text c="dimmed" size="sm">
              Одноканальная система без очереди: если прибор занят — отказ. Event-driven симуляция с min-heap очередью событий.
            </Text>
          </div>

          <ParamPanel params={params} setParams={setParams} onRun={run} loading={loading} />

          {error && (
            <Alert color="red" title="Ошибка">
              {error} — убедитесь, что сервер запущен на порту 8089.
            </Alert>
          )}

          {loading && (
            <Center py="xl">
              <Loader size="lg" />
            </Center>
          )}

          {data && !loading && (
            <Tabs defaultValue="prob" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="prob">Распределение вероятностей</Tabs.Tab>
                <Tabs.Tab value="stats">Статистика и теория</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="prob" pt="md">
                <ProbDistSection data={data} />
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
