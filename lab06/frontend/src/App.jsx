// Лабораторная работа №6 — Имитационное моделирование дискретных и непрерывных СВ
//
// Часть 1: Дискретная СВ X ∈ {1,2,3,4,5}, P ∈ {0.1, 0.2, 0.4, 0.2, 0.1}
//   Инверсный метод: α ~ U[0,1) → X = xi, где CDF[i-1] ≤ α < CDF[i]
//   Критерий согласия χ² при N = 10, 100, 1000, 10000
//
// Часть 2: Нормальная СВ X ~ N(0,1) методом Бокса–Мюллера
//   Z = √(−2·ln α₁)·cos(2π·α₂),  оба α ∈ [0,1) — числа, не проценты

import { useState, useEffect } from 'react'
import {
  MantineProvider, Container, Title, Text, Stack, Card, Table,
  Button, Grid, Badge, Group, Tabs, Code, Loader, Center,
  Paper, ScrollArea, Divider,
} from '@mantine/core'
import { BarChart, CompositeChart } from '@mantine/charts'
import './App.css'

// ─── Утилиты ─────────────────────────────────────────────────────────────────

const fmt = (v, d = 4) => (typeof v === 'number' ? v.toFixed(d) : '—')

// Строим CDF массив из массива вероятностей
function buildCDF(probs) {
  const cdf = []
  let cum = 0
  for (const p of probs) { cum += p; cdf.push(cum) }
  return cdf
}

// ─── Секция 1: Дискретная СВ ─────────────────────────────────────────────────

function DiscreteTab({ result, dist }) {
  if (!result) return null

  const cdf = buildCDF(dist.map(d => d.p))

  // Данные для гистограммы: наблюд. vs ожидаемые частоты
  const barData = dist.map((d, i) => ({
    x: String(d.x),
    'Наблюдаемые': Math.round(result.observed[i]),
    'Ожидаемые': Math.round(result.expected[i]),
  }))

  return (
    <Stack gap="md">
      {/* χ²-тест */}
      <Paper withBorder p="sm" radius="md"
        bg={result.chi2Pass ? 'green.0' : 'red.0'}
        style={{ borderColor: result.chi2Pass ? '#2f9e44' : '#e03131' }}
      >
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <Badge color={result.chi2Pass ? 'green' : 'red'} size="lg">
              {result.chi2Pass ? '✓ Гипотеза H₀ не отвергается' : '✗ Гипотеза H₀ отвергается'}
            </Badge>
            <Text size="sm">α = 0.05</Text>
          </Group>
          <Code>{`χ² = ${fmt(result.chi2, 3)}  χ²крит = ${fmt(result.chi2Crit, 3)}  df = ${result.chi2Df}`}</Code>
        </Group>
        <Text size="xs" c="dimmed" mt={4}>
          {result.chi2Pass
            ? `χ² = ${fmt(result.chi2, 3)} < χ²крит = ${fmt(result.chi2Crit, 3)} → распределение согласуется с теоретическим`
            : `χ² = ${fmt(result.chi2, 3)} ≥ χ²крит = ${fmt(result.chi2Crit, 3)} → расхождение статистически значимо`
          }
        </Text>
      </Paper>

      <Grid gutter="md">
        {/* Таблица частот и вероятностей */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <ScrollArea>
            <Table withTableBorder withColumnBorders fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>xi</Table.Th>
                  <Table.Th>pi (теор.)</Table.Th>
                  <Table.Th>CDF</Table.Th>
                  <Table.Th>Oi (набл.)</Table.Th>
                  <Table.Th>Ei = N·pi</Table.Th>
                  <Table.Th>p̂ (эмп.)</Table.Th>
                  <Table.Th>|p̂ − pi|</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {dist.map((d, i) => (
                  <Table.Tr key={i}>
                    <Table.Td fw={600}>{d.x}</Table.Td>
                    <Table.Td><Code>{fmt(d.p, 2)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(cdf[i], 2)}</Code></Table.Td>
                    <Table.Td><Code>{Math.round(result.observed[i])}</Code></Table.Td>
                    <Table.Td><Code>{fmt(result.expected[i], 1)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(result.empProbs[i], 4)}</Code></Table.Td>
                    <Table.Td>
                      <Code style={{ color: Math.abs(result.empProbs[i] - d.p) > 0.05 ? '#e03131' : '#2f9e44' }}>
                        {fmt(Math.abs(result.empProbs[i] - d.p), 4)}
                      </Code>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td colSpan={3} fw={600}>Итого / E[X] / D[X]</Table.Td>
                  <Table.Td fw={600}>{result.n}</Table.Td>
                  <Table.Td fw={600}>{result.n}</Table.Td>
                  <Table.Td colSpan={2}>
                    <Text size="xs">
                      x̄ = {fmt(result.empMean)} | theoE = 3.0<br />
                      D̂ = {fmt(result.empVar)} | theoD = 1.2
                    </Text>
                  </Table.Td>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </ScrollArea>
        </Grid.Col>

        {/* Гистограмма наблюд. vs ожид. */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Text size="sm" fw={500} mb="xs" ta="center">Наблюдаемые vs Ожидаемые частоты</Text>
          <BarChart
            h={220}
            data={barData}
            dataKey="x"
            series={[
              { name: 'Наблюдаемые', color: 'blue.6' },
              { name: 'Ожидаемые',   color: 'orange.5' },
            ]}
            xAxisLabel="xi"
            yAxisLabel="freq"
            withLegend
            legendProps={{ verticalAlign: 'top' }}
          />
        </Grid.Col>
      </Grid>

      {/* Параметры */}
      <Group gap="lg">
        <Paper withBorder px="md" py="xs" radius="md">
          <Text size="xs" c="dimmed">Эмпирическое E[X]</Text>
          <Text fw={700}>{fmt(result.empMean, 4)}</Text>
        </Paper>
        <Paper withBorder px="md" py="xs" radius="md">
          <Text size="xs" c="dimmed">Теоретическое E[X]</Text>
          <Text fw={700}>3.0000</Text>
        </Paper>
        <Paper withBorder px="md" py="xs" radius="md">
          <Text size="xs" c="dimmed">Эмпирическое D[X]</Text>
          <Text fw={700}>{fmt(result.empVar, 4)}</Text>
        </Paper>
        <Paper withBorder px="md" py="xs" radius="md">
          <Text size="xs" c="dimmed">Теоретическое D[X]</Text>
          <Text fw={700}>1.2000</Text>
        </Paper>
      </Group>
    </Stack>
  )
}

// ─── Секция 2: Нормальная СВ ─────────────────────────────────────────────────

function NormalHistCard({ result }) {
  if (!result) return null

  const chartData = result.histogram.map(b => ({
    x: b.mid.toFixed(1),
    'Эмп. плотность': parseFloat(b.freq.toFixed(4)),
    'N(0,1)': parseFloat(b.dens.toFixed(4)),
  }))

  return (
    <Card withBorder shadow="sm" radius="md" padding="md" h="100%">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={700} size="sm">N = {result.n.toLocaleString('ru-RU')}</Text>
          <Badge variant="light" color="teal">Бокс–Мюллер</Badge>
        </Group>
        <Group gap="md">
          <Text size="xs">x̄ = <Code>{fmt(result.empMean, 4)}</Code></Text>
          <Text size="xs">σ̂ = <Code>{fmt(result.empStdDev, 4)}</Code></Text>
        </Group>
        <CompositeChart
          h={260}
          data={chartData}
          dataKey="x"
          series={[
            { name: 'Эмп. плотность', type: 'bar',  color: 'blue.4' },
            { name: 'N(0,1)',          type: 'line', color: 'red.6' },
          ]}
          xAxisLabel="Z"
          withLegend
          legendProps={{ verticalAlign: 'top', height: 30 }}
        />
        <Text size="xs" c="dimmed" ta="center">
          Теория: E[Z]=0, D[Z]=1 | Эмпирика: {fmt(result.empMean, 3)}, {fmt(result.empStdDev*result.empStdDev, 3)}
        </Text>
      </Stack>
    </Card>
  )
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function App() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/simulate')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  // Запускаем сразу при монтировании
  useEffect(() => { run() }, [])

  return (
    <MantineProvider>
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Заголовок */}
          <div>
            <Title order={1}>Лабораторная работа №6</Title>
            <Text c="dimmed" mt={4} size="lg">
              Имитационное моделирование дискретных и непрерывных случайных величин
            </Text>
          </div>

          {/* Методы */}
          <Paper withBorder p="md" radius="md" bg="blue.0">
            <Text fw={600} size="sm" mb={4}>Используемые алгоритмы:</Text>
            <Code block fz={12}>{[
              '// Дискретная СВ — инверсный метод:',
              '// α ~ U[0,1)  — число из [0,1), НЕ процент',
              '// Находим i : CDF[i-1] ≤ α < CDF[i] → X = xi',
              '',
              '// Нормальная СВ — метод Бокса–Мюллера:',
              '// α₁, α₂ ~ U[0,1) — оба числа, не проценты',
              '// Z₁ = √(−2·ln α₁) · cos(2π·α₂) ~ N(0,1)',
              '// Z₂ = √(−2·ln α₁) · sin(2π·α₂) ~ N(0,1)',
            ].join('\n')}</Code>
          </Paper>

          <Button onClick={run} loading={loading} w={200}>
            Пересчитать
          </Button>

          {error && <Text c="red">Ошибка: {error}. Запущен ли бэкенд на portu 8086?</Text>}

          {loading && !data && (
            <Center h={200}><Loader /></Center>
          )}

          {/* ─── Часть 1: Дискретная СВ ────────── */}
          {data && (
            <Card withBorder shadow="sm" radius="md" padding="lg">
              <Stack gap="md">
                <Title order={2}>Часть 1 — Дискретная случайная величина</Title>

                {/* Таблица распределения */}
                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Text fw={600} size="sm" mb="xs">Ряд распределения</Text>
                    <Table withTableBorder withColumnBorders fz="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>X</Table.Th>
                          {data.distribution.map(d => (
                            <Table.Th key={d.x} ta="center">{d.x}</Table.Th>
                          ))}
                          <Table.Th>Σ</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td fw={600}>p</Table.Td>
                          {data.distribution.map(d => (
                            <Table.Td key={d.x} ta="center"><Code>{d.p.toFixed(2)}</Code></Table.Td>
                          ))}
                          <Table.Td ta="center"><Code>1.00</Code></Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                          <Table.Td fw={600}>CDF</Table.Td>
                          {buildCDF(data.distribution.map(d=>d.p)).map((c, i) => (
                            <Table.Td key={i} ta="center"><Code>{c.toFixed(2)}</Code></Table.Td>
                          ))}
                          <Table.Td ta="center"><Code>—</Code></Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Text fw={600} size="sm" mb="xs">Теоретические параметры</Text>
                    <Stack gap="xs">
                      <Paper withBorder p="sm" radius="md">
                        <Code block fz={12}>{[
                          `E[X] = Σ xi·pi = 1·0.1 + 2·0.2 + 3·0.4 + 4·0.2 + 5·0.1 = ${data.theoMean.toFixed(1)}`,
                          `D[X] = E[X²] − (E[X])² = 10.2 − 9.0 = ${data.theoVar.toFixed(1)}`,
                          `σ[X] = √D[X] = √${data.theoVar.toFixed(1)} ≈ ${Math.sqrt(data.theoVar).toFixed(4)}`,
                        ].join('\n')}</Code>
                      </Paper>
                      <Text size="xs" c="dimmed">
                        Критерий χ²: df = k−1 = 4, χ²крит(4, 0.05) = 9.488.<br />
                        При χ² &lt; 9.488 гипотеза H₀ не отвергается.
                      </Text>
                    </Stack>
                  </Grid.Col>
                </Grid>

                <Divider label="Результаты по размерам выборки" labelPosition="center" />

                {/* Вкладки N = 10, 100, 1000, 10000 */}
                <Tabs defaultValue="n1000">
                  <Tabs.List>
                    {data.discreteResults.map(r => (
                      <Tabs.Tab
                        key={r.n}
                        value={`n${r.n}`}
                        color={r.chi2Pass ? 'green' : 'red'}
                        rightSection={
                          <Badge size="xs" color={r.chi2Pass ? 'green' : 'red'} variant="filled">
                            {r.chi2Pass ? '✓' : '✗'}
                          </Badge>
                        }
                      >
                        N = {r.n}
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                  {data.discreteResults.map(r => (
                    <Tabs.Panel key={r.n} value={`n${r.n}`} pt="md">
                      <DiscreteTab result={r} dist={data.distribution} />
                    </Tabs.Panel>
                  ))}
                </Tabs>
              </Stack>
            </Card>
          )}

          {/* ─── Часть 2: Нормальная СВ ─────────── */}
          {data && (
            <Card withBorder shadow="sm" radius="md" padding="lg">
              <Stack gap="md">
                <Title order={2}>Часть 2 — Нормальная случайная величина N(0,1)</Title>
                <Text size="sm" c="dimmed">
                  Метод Бокса–Мюллера: два U[0,1) → два N(0,1). Гистограмма сравнивается
                  с теоретической плотностью φ(z) = e^(−z²/2) / √(2π).
                </Text>

                <Grid gutter="md">
                  {data.normalResults.map(r => (
                    <Grid.Col key={r.n} span={{ base: 12, md: 4 }}>
                      <NormalHistCard result={r} />
                    </Grid.Col>
                  ))}
                </Grid>
              </Stack>
            </Card>
          )}

          {/* Выводы */}
          {data && (
            <Card withBorder shadow="sm" radius="md" padding="lg" bg="gray.0">
              <Title order={3} mb="sm">Выводы</Title>
              <Stack gap="xs">
                <Text size="sm">
                  <strong>1.</strong> Инверсный метод позволяет генерировать дискретную СВ с заданным
                  распределением, используя одно α ∈ [0,1) на каждую реализацию. При N=10 отклонения
                  велики; при N=10000 эмпирические вероятности сходятся к теоретическим.
                </Text>
                <Text size="sm">
                  <strong>2.</strong> Критерий χ² подтверждает соответствие при больших N.
                  При малых N (N=10) случайные отклонения могут вызвать отвержение H₀ даже при
                  правильной модели — это нормально.
                </Text>
                <Text size="sm">
                  <strong>3.</strong> Метод Бокса–Мюллера эффективно преобразует пару U[0,1)
                  в пару N(0,1). При увеличении N гистограмма приближается к колоколообразной
                  теоретической кривой N(0,1).
                </Text>
                <Text size="sm">
                  <strong>4.</strong> Во всех алгоритмах α — вещественное число ∈ [0,1), не процент.
                  Весь инструментарий имитации строится на одном базовом датчике равномерного распределения.
                </Text>
              </Stack>
            </Card>
          )}
        </Stack>
      </Container>
    </MantineProvider>
  )
}
