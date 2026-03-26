// Лабораторная работа №4 — Базовый датчик случайных чисел
//
// Четыре генератора U[0, 1]:
//   1. МКГ — мультипликативный конгруэнтный генератор
//   2. Середина квадрата (фон Нейман, 1946) — классика с вырождением
//   3. Середина квадрата + последовательность Вейля (MSWS) — без вырождения
//   4. Встроенный rand.Float64() Go — ГПСЧ на основе LFSR

import { useState, useEffect, useCallback } from 'react'
import {
  MantineProvider, Container, Title, Text, Stack, Card, Table,
  Button, Alert, Grid, Badge, Group, Divider, Code, Loader, Center,
  Paper, ScrollArea, Tooltip, Tabs,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import './App.css'

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function absDev(s, t) { return (s - t).toFixed(6) }

function toChartData(histogram) {
  return histogram.map((bin, i) => ({
    label: i % 5 === 0 ? bin.min.toFixed(2) : '',
    частота: parseFloat(bin.freq.toFixed(5)),
  }))
}

function qualityOf(stats, theo) {
  const dm = Math.abs(stats.mean - theo.mean)
  const dv = Math.abs(stats.variance - theo.variance)
  if (dm < 0.005 && dv < 0.005) return 'excellent'
  if (dm < 0.05  && dv < 0.05)  return 'good'
  return 'poor'
}

function detectDegeneration(histogram) {
  return Math.max(...histogram.map(b => b.freq)) > 0.5
}

// ─── DeviationBadge ──────────────────────────────────────────────────────────

function DeviationBadge({ value }) {
  const abs = Math.abs(parseFloat(value))
  const color = abs < 0.005 ? 'green' : abs < 0.05 ? 'yellow' : 'red'
  const sign = parseFloat(value) >= 0 ? '+' : ''
  return <Badge color={color} variant="light" size="sm">{sign}{value}</Badge>
}

// ─── QualityBadge ─────────────────────────────────────────────────────────────

const QUALITY = {
  excellent: { color: 'green',  label: 'Отличное' },
  good:      { color: 'yellow', label: 'Хорошее' },
  poor:      { color: 'red',    label: 'Неудовл.' },
}

function QualityBadge({ quality }) {
  const { color, label } = QUALITY[quality]
  return <Badge color={color} variant="filled" size="md">{label}</Badge>
}

// ─── FirstValues / TransitionSample ─────────────────────────────────────────

function AlphaBadges({ values, startIdx = 0, highlightLast = false }) {
  if (!values || values.length === 0) return null
  return (
    <ScrollArea>
      <Group gap={4} wrap="nowrap" pb={4}>
        {values.map((v, i) => {
          const idx = startIdx + i
          const isZero = v < 0.001
          const isLast = highlightLast && i === values.length - 1
          return (
            <Tooltip key={i} label={`α${idx} = ${v.toFixed(8)}`} withArrow>
              <Badge
                variant={isZero || isLast ? 'filled' : 'outline'}
                color={isZero ? 'red' : isLast ? 'orange' : 'blue'}
                size="sm"
                className="mono-badge"
              >
                {v.toFixed(4)}
              </Badge>
            </Tooltip>
          )
        })}
      </Group>
    </ScrollArea>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ title, formula, stats, theoretical, color, barColor }) {
  const quality = qualityOf(stats, theoretical)
  const degenerated = detectDegeneration(stats.histogram)
  const chartData = toChartData(stats.histogram)
  const expectedFreq = 1 / stats.histogram.length
  const maxFreq = Math.max(...stats.histogram.map(b => b.freq))

  const rows = [
    { label: 'Среднее E[α]',   sample: stats.mean,     theory: theoretical.mean },
    { label: 'Дисперсия D[α]', sample: stats.variance, theory: theoretical.variance },
    { label: 'СКО σ',          sample: stats.stdDev,   theory: theoretical.stdDev },
  ]

  // Вычисляем startIdx для TransitionSample
  const tsStart = stats.degeneratedAt >= 0
    ? Math.max(0, stats.degeneratedAt - (stats.transitionSample?.length ?? 1) + 1)
    : 0

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">

        {/* Заголовок */}
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div>
            <Text fw={700} size="lg" c={color}>{title}</Text>
            {formula && <Text size="xs" c="dimmed" mt={2} className="formula-inline">{formula}</Text>}
          </div>
          <QualityBadge quality={quality} />
        </Group>

        {/* Алерт вырождения */}
        {degenerated && (
          <Alert color="orange" variant="light" title="Вырождение" radius="md">
            <Text size="sm">
              Последовательность схлопнулась в ноль на шаге&nbsp;
              <strong>{stats.degeneratedAt}</strong>. Это известный дефект классического
              метода середины квадрата: при x&nbsp;→&nbsp;0 всегда 0² = 0, цикл зацикливается.
            </Text>
          </Alert>
        )}

        {/* Таблица */}
        <ScrollArea type="auto">
          <Table striped highlightOnHover withTableBorder withColumnBorders fz="sm" miw={380}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Хар-ка</Table.Th>
                <Table.Th>Выборочное</Table.Th>
                <Table.Th>Теорет.</Table.Th>
                <Table.Th>Δ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ label, sample, theory }) => (
                <Table.Tr key={label}>
                  <Table.Td>{label}</Table.Td>
                  <Table.Td><Code>{sample.toFixed(6)}</Code></Table.Td>
                  <Table.Td><Code>{theory.toFixed(6)}</Code></Table.Td>
                  <Table.Td><DeviationBadge value={absDev(sample, theory)} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {/* Значения α */}
        {degenerated ? (
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Переход к вырождению (шаг {stats.degeneratedAt} выделен оранжевым):
            </Text>
            <AlphaBadges
              values={stats.transitionSample}
              startIdx={tsStart}
              highlightLast
            />
          </div>
        ) : (
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Первые {stats.firstValues?.length} значений α ∈ [0, 1) — число, не процент:
            </Text>
            <AlphaBadges values={stats.firstValues} />
          </div>
        )}

        {/* Гистограмма */}
        <div>
          <Group justify="space-between" mb={2} wrap="nowrap">
            <Text size="sm" c="dimmed">Гистограмма α (30 интервалов)</Text>
            {degenerated && (
              <Text size="xs" c="orange.7" fw={500} style={{ whiteSpace: 'nowrap' }}>
                {(maxFreq * 100).toFixed(1)}% в корзине 0 (ось обрезана)
              </Text>
            )}
          </Group>
          {degenerated && (
            <Text size="xs" c="dimmed" mb={4}>
              Ось Y обрезана до ≈5%: первый столбец ({(maxFreq*100).toFixed(1)}%) выходит за рамки.
            </Text>
          )}
          <div style={{ height: 200, width: '100%' }}>
            <BarChart
              h={200}
              data={chartData}
              dataKey="label"
              series={[{ name: 'частота', color: barColor }]}
              referenceLines={[{ y: expectedFreq, label: 'Теория', color: 'red.6' }]}
              yAxisProps={{
                tickFormatter: (v) => v.toFixed(3),
                ...(degenerated ? { domain: [0, Math.max(expectedFreq * 2.5, 0.05)], allowDataOverflow: true } : {}),
              }}
              tooltipProps={{ formatter: (v) => [v.toFixed(5), 'Частота'] }}
            />
          </div>
        </div>

      </Stack>
    </Card>
  )
}

// ─── Приложение ──────────────────────────────────────────────────────────────

export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/generate')
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`)
      setData(await res.json())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <MantineProvider>
      <Container size="xl" py="xl">
        <Stack gap="xl">

          {/* Шапка */}
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
            <div>
              <Title order={1}>Лабораторная работа №4</Title>
              <Text c="dimmed" mt={4} size="lg">
                Базовый датчик случайных чисел — стохастическое моделирование
              </Text>
            </div>
            <Group gap="sm" align="center">
              {data && (
                <Text size="sm" c="dimmed">
                  N = <strong>{data.sampleSize.toLocaleString('ru-RU')}</strong>
                </Text>
              )}
              <Button onClick={fetchData} loading={loading} size="md">Перегенерировать</Button>
            </Group>
          </Group>

          {/* Параметры генераторов */}
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper withBorder p="md" radius="md" h="100%">
                <Text fw={600} size="sm" c="blue.7" mb="xs">МКГ — мультипликативный конгруэнтный</Text>
                <Code block fz={11}>{[
                  'x*ᵢ = (β · x*ᵢ₋₁) mod M',
                  'αᵢ  = x*ᵢ / M  ∈ [0, 1)   ← число, не %',
                  '',
                  `β  = 2³²+3 = ${data?.mcgParams.beta ?? '4 294 967 299'}`,
                  `M  = 2⁶³   = ${data?.mcgParams.m    ?? '9 223 372 036 …'}`,
                  'x₀ = β',
                ].join('\n')}</Code>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper withBorder p="md" radius="md" h="100%">
                <Text fw={600} size="sm" c="grape.7" mb="xs">Середина квадрата — фон Нейман (1946)</Text>
                <Code block fz={11}>{[
                  '1. x n-значное',
                  '2. x² → 2n цифр',
                  '3. средние n цифр → новое x',
                  'αᵢ = x / 10ⁿ  ∈ [0, 1)    ← число, не %',
                  '',
                  `n = ${data?.msParams.digits ?? 8},  x₀ = ${data?.msParams.seed ?? '67 539 821'}`,
                ].join('\n')}</Code>
              </Paper>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper withBorder p="md" radius="md" h="100%">
                <Text fw={600} size="sm" c="violet.7" mb="xs">Середина квадрата + Вейль (MSWS, 2017)</Text>
                <Code block fz={11}>{[
                  'x = x²',
                  'w = w + s    (монотонный счётчик)',
                  'x = x + w   (предотвращает x→0)',
                  'x = rotate32(x)',
                  'αᵢ = uint32(x) / 2³²  ∈ [0,1) ← число',
                  '',
                  `x₀=${data?.mswParams.seed ?? '4 294 967 299'}`,
                  `s = 0xb5ad4ece… (нечётная)`,
                ].join('\n')}</Code>
              </Paper>
            </Grid.Col>
          </Grid>

          {error && <Alert color="red" title="Ошибка соединения" radius="md">{error}</Alert>}
          {loading && !data && <Center py="xl"><Loader size="lg" /></Center>}

          {data && (
            <>
              {/* 4 генератора */}
              <Grid gutter="md">
                <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
                  <StatCard
                    title="МКГ — реализованный"
                    formula="x*ᵢ = (β·x*ᵢ₋₁) mod M,  αᵢ = x*ᵢ/M"
                    stats={data.mcg}
                    theoretical={data.theoretical}
                    color="blue.7" barColor="blue.5"
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
                  <StatCard
                    title="Середина квадрата"
                    formula="x → x² → средние n цифр → α  (плохой)"
                    stats={data.middleSquare}
                    theoretical={data.theoretical}
                    color="grape.7" barColor="grape.5"
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
                  <StatCard
                    title="Середина² + Вейль"
                    formula="x=x²; w+=s; x+=w; rotate32 → α  (хороший)"
                    stats={data.middleSquareWeyl}
                    theoretical={data.theoretical}
                    color="violet.7" barColor="violet.5"
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6, xl: 3 }}>
                  <StatCard
                    title="Встроенный Go"
                    formula="rand.Float64() — ГПСЧ на основе LFSR"
                    stats={data.builtin}
                    theoretical={data.theoretical}
                    color="teal.7" barColor="teal.5"
                  />
                </Grid.Col>
              </Grid>

              <Divider label="Сводное сравнение" labelPosition="center" />

              {/* Сводная таблица */}
              <Card withBorder shadow="sm" radius="md" padding="lg">
                <Title order={3} mb="xs">Сводное сравнение с теорией</Title>
                <Text size="sm" c="dimmed" mb="md">
                  Теор. U[0,1]: E[α]=0.5, D[α]=1/12≈0.083333, σ=1/√12≈0.288675.
                  α — вещественное число (float64), НЕ процент.
                </Text>
                <ScrollArea>
                  <Table striped highlightOnHover withTableBorder withColumnBorders fz="sm" miw={760}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Хар-ка</Table.Th>
                        <Table.Th>МКГ</Table.Th><Table.Th>Δ</Table.Th>
                        <Table.Th>МС класс.</Table.Th><Table.Th>Δ</Table.Th>
                        <Table.Th>МС+Вейль</Table.Th><Table.Th>Δ</Table.Th>
                        <Table.Th>Go</Table.Th><Table.Th>Δ</Table.Th>
                        <Table.Th>Теория</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {[
                        { label: 'E[α]', key: 'mean' },
                        { label: 'D[α]', key: 'variance' },
                        { label: 'σ',    key: 'stdDev' },
                      ].map(({ label, key }) => (
                        <Table.Tr key={key}>
                          <Table.Td fw={500}>{label}</Table.Td>
                          {[
                            data.mcg, data.middleSquare, data.middleSquareWeyl, data.builtin
                          ].map((gen, gi) => (
                            [
                              <Table.Td key={`v${gi}`}><Code>{gen[key].toFixed(6)}</Code></Table.Td>,
                              <Table.Td key={`d${gi}`}><DeviationBadge value={absDev(gen[key], data.theoretical[key])} /></Table.Td>,
                            ]
                          ))}
                          <Table.Td><Code>{data.theoretical[key].toFixed(6)}</Code></Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Card>

              {/* Выводы */}
              <Card withBorder shadow="sm" radius="md" padding="lg" bg="gray.0">
                <Title order={3} mb="sm">Выводы</Title>
                <Stack gap="xs">
                  <Text size="sm"><strong>1.</strong> МКГ с β=2³²+3 и M=2⁶³ даёт равномерное U[0,1]: все 30 столбцов ≈ 1/30. Отклонения при N=100&thinsp;000 минимальны.</Text>
                  <Text size="sm"><strong>2.</strong> Классический метод середины квадрата деградирует: на шаге {data.middleSquare.degeneratedAt} последовательность падает в ноль и зацикливается. Гистограмма показывает 88%+ в первой корзине — генератор непригоден.</Text>
                  <Text size="sm"><strong>3.</strong> MSWS (Stafford 2017) добавляет счётчик Вейля, предотвращающий вырождение. Результат сопоставим с МКГ и встроенным генератором Go.</Text>
                  <Text size="sm"><strong>4.</strong> Во всех генераторах α — вещественное число (float64) ∈ [0, 1): например 0.500614…, а не «50%». Это и есть базовый датчик равномерного распределения.</Text>
                </Stack>
              </Card>
            </>
          )}

        </Stack>
      </Container>
    </MantineProvider>
  )
}
