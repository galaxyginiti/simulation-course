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
  const stable = rho < 1

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
            color={stable ? 'green' : 'red'}
            variant={stable ? 'outline' : 'filled'}
          >
            ρ = λ/μ = {fmt(rho, 3)} {stable ? '< 1 ✓' : '≥ 1 — система неустойчива!'}
          </Badge>
        </Group>

        {!stable && (
          <Alert color="red" title="Система M/M/1 неустойчива">
            При ρ ≥ 1 очередь растёт неограниченно. Увеличьте μ или уменьшите λ.
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
          Вероятность того, что в системе находится ровно k заявок.
          Теор. P(N = k) = (1 − ρ) · ρᵏ, ρ = {fmt(data.rho, 3)}, P₀ = {fmt(data.theoP0, 3)}.
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
    { label: 'L — среднее в системе',     theo: data.theoL,   emp: data.empL },
    { label: 'Lq — среднее в очереди',    theo: data.theoLq,  emp: data.empLq },
    { label: 'W — среднее время (сист.)', theo: data.theoW,   emp: data.empW },
    { label: 'Wq — среднее ожидание',     theo: data.theoWq,  emp: data.empWq },
    { label: 'ρ — загрузка сервера',      theo: data.rho,     emp: data.empUtilization },
    { label: 'P₀ — вероятность простоя',  theo: data.theoP0,  emp: 1 - data.empUtilization },
  ]

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Теория vs Эксперимент (M/M/1)</Title>

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Обслужено заявок</Text>
              <Title order={2} c="blue">{data.totalCustomers.toLocaleString()}</Title>
              <Text size="xs" c="dimmed">за T = {data.totalTime}</Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Коэф. загрузки ρ</Text>
              <Title order={2} c={data.rho < 0.8 ? 'green' : data.rho < 1 ? 'yellow' : 'red'}>
                {fmt(data.rho, 3)}
              </Title>
              <Text size="xs" c="dimmed">λ/μ = {data.lambda}/{data.mu}</Text>
            </Paper>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Paper withBorder p="md" radius="md" ta="center">
              <Text size="xs" c="dimmed">Устойчивость</Text>
              <Badge size="xl" color={data.stable ? 'green' : 'red'} mt="xs">
                {data.stable ? 'Устойчива (ρ < 1)' : 'Неустойчива (ρ ≥ 1)'}
              </Badge>
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
            `P₀ = 1 − ρ = ${fmt(data.theoP0, 4)}`,
            `L  = ρ/(1−ρ) = ${fmt(data.theoL, 4)}`,
            `Lq = ρ²/(1−ρ) = ${fmt(data.theoLq, 4)}`,
            `W  = 1/(μ−λ) = 1/${data.mu - data.lambda} = ${fmt(data.theoW, 4)}`,
            `Wq = ρ/(μ−λ) = ${fmt(data.theoWq, 4)}`,
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
              Одноканальная система с пуассоновским входным потоком и экспоненциальным
              временем обслуживания. Event-driven симуляция с min-heap очередью событий.
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
