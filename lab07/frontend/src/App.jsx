// Лабораторная работа №7 — Марковская модель погоды
//
// Непрерывная цепь Маркова (CTMC), 3 состояния:
//   1 — Ясно, 2 — Облачно, 3 — Пасмурно
//
// Алгоритм Гиллеспи:
//   В состоянии i: T = −ln(U₁) / |Q[i][i]|  (U₁ ~ U(0,1))  — время пребывания
//   Следующее состояние j: U₂ ~ U(0,1), P(j) = λ_ij / |Q[i][i]| — инверсный метод

import { useState, useEffect, useRef } from 'react'
import {
  MantineProvider, Container, Title, Text, Stack, Card, Table,
  Button, Grid, Badge, Group, Tabs, Code, Loader, Center,
  Paper, ScrollArea, Divider, NumberInput, ActionIcon, Slider,
  Select, RingProgress,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import './App.css'

// ─── Константы состояний ──────────────────────────────────────────────────────

const STATES = [
  { id: 1, name: 'Ясно',     emoji: '☀️',  colorKey: 'yellow', hex: '#FAB005', cssClass: 'weather-card-sunny'   },
  { id: 2, name: 'Облачно',  emoji: '⛅',  colorKey: 'blue',   hex: '#339AF0', cssClass: 'weather-card-cloudy'  },
  { id: 3, name: 'Пасмурно', emoji: '☁️',  colorKey: 'gray',   hex: '#868E96', cssClass: 'weather-card-overcast'},
]

// ─── Утилиты ──────────────────────────────────────────────────────────────────

const fmt = (v, d = 4) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—')

// Найти состояние в момент времени t
function stateAtTime(transitions, t) {
  for (const tr of transitions) {
    if (t >= tr.enterTime && t <= tr.exitTime) return tr.state
  }
  return transitions[transitions.length - 1]?.state ?? 1
}

// Построить данные для графика-ступенчатой функции
function buildStepData(transitions) {
  if (!transitions || transitions.length === 0) return []
  const pts = []
  for (const tr of transitions) {
    pts.push({ t: parseFloat(tr.enterTime.toFixed(3)), state: tr.state })
  }
  const last = transitions[transitions.length - 1]
  pts.push({ t: parseFloat(last.exitTime.toFixed(3)), state: last.state })
  return pts
}

// ─── Компонент: Текущая погода ────────────────────────────────────────────────

function WeatherCard({ stateId, currentTime, totalTime }) {
  const s = STATES[(stateId ?? 1) - 1]
  return (
    <Card withBorder shadow="sm" radius="md" padding="lg" className={s.cssClass}>
      <Stack align="center" gap={4}>
        <Text style={{ fontSize: 72, lineHeight: 1 }}>{s.emoji}</Text>
        <Badge size="xl" color={s.colorKey} variant="filled" mt={4}>
          {s.name}
        </Badge>
        <Text size="sm" c="dimmed" mt={4}>
          День {typeof currentTime === 'number' ? currentTime.toFixed(1) : '—'} / {totalTime}
        </Text>
      </Stack>
    </Card>
  )
}

// ─── Компонент: Анимация ──────────────────────────────────────────────────────

const SPEEDS = [
  { value: '300', label: 'Медленно' },
  { value: '120', label: 'Нормально' },
  { value: '40',  label: 'Быстро' },
]

function AnimationSection({ data }) {
  const [animIdx, setAnimIdx]   = useState(0)   // индекс текущего перехода
  const [isPlaying, setPlaying] = useState(false)
  const [speed, setSpeed]       = useState('120')
  const intervalRef = useRef(null)

  const transitions = data?.transitions ?? []
  const total = transitions.length

  // Текущий переход
  const cur = transitions[animIdx] ?? transitions[0]
  const stateId = cur?.state ?? 1
  const currentTime = cur?.enterTime ?? 0

  // Запуск/остановка анимации
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setAnimIdx(prev => {
          if (prev >= total - 1) {
            setPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, parseInt(speed, 10))
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, speed, total])

  const handlePlay  = () => { if (animIdx >= total - 1) setAnimIdx(0); setPlaying(true) }
  const handlePause = () => setPlaying(false)
  const handleReset = () => { setPlaying(false); setAnimIdx(0) }

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Анимация моделирования</Title>
        <Text size="sm" c="dimmed">
          Просмотр погоды по переходам. Каждый шаг — один интервал пребывания в состоянии.
        </Text>

        <Grid gutter="md">
          {/* Погодная карточка */}
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <WeatherCard
              stateId={stateId}
              currentTime={currentTime}
              totalTime={data.totalTime}
            />
          </Grid.Col>

          {/* Управление */}
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <Stack gap="sm">
              {/* Счётчик переходов */}
              <Group gap="xs">
                <Badge variant="outline" size="lg">
                  Переход {animIdx + 1} / {total}
                </Badge>
                <Badge variant="light" color={STATES[stateId - 1].colorKey}>
                  {STATES[stateId - 1].name} ({fmt(cur?.duration, 2)} дн.)
                </Badge>
              </Group>

              {/* Ползунок */}
              <Slider
                value={animIdx}
                min={0}
                max={Math.max(total - 1, 1)}
                step={1}
                onChange={v => { setPlaying(false); setAnimIdx(v) }}
                label={v => `${transitions[v]?.enterTime?.toFixed(1) ?? ''} дн.`}
                marks={[
                  { value: 0,          label: '0' },
                  { value: Math.floor(total / 2), label: `${Math.floor(data.totalTime / 2)}д` },
                  { value: total - 1,  label: `${data.totalTime}д` },
                ]}
                mb="md"
              />

              {/* Кнопки */}
              <Group gap="sm">
                <Button
                  variant="filled"
                  color="green"
                  onClick={handlePlay}
                  disabled={isPlaying || animIdx >= total - 1}
                >
                  ▶ Играть
                </Button>
                <Button
                  variant="outline"
                  color="orange"
                  onClick={handlePause}
                  disabled={!isPlaying}
                >
                  ⏸ Пауза
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  ⏮ Сброс
                </Button>
                <Select
                  data={SPEEDS}
                  value={speed}
                  onChange={v => setSpeed(v ?? '120')}
                  label="Скорость"
                  w={140}
                />
              </Group>

              {/* Мини-статистика текущего момента */}
              <Paper withBorder p="xs" radius="md" bg="gray.0">
                <Code block fz={11}>{[
                  `Вход:  ${fmt(cur?.enterTime, 3)} дн.`,
                  `Выход: ${fmt(cur?.exitTime, 3)} дн.`,
                  `Длит.: ${fmt(cur?.duration, 3)} дн.`,
                ].join('\n')}</Code>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Card>
  )
}

// ─── Компонент: График временного ряда ───────────────────────────────────────

function TimelineSection({ transitions, totalTime }) {
  const chartData = buildStepData(transitions)

  // Кастомный тултип
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const p = payload[0]
    const s = STATES[(p.value ?? 1) - 1]
    return (
      <Paper withBorder p="xs" radius="sm" shadow="sm" style={{ fontSize: 12 }}>
        <Text size="xs">День: <b>{p.payload.t?.toFixed(2)}</b></Text>
        <Text size="xs">{s.emoji} {s.name}</Text>
      </Paper>
    )
  }

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="sm">
        <Title order={3}>Временной ряд состояний</Title>
        <Text size="xs" c="dimmed">
          Ступенчатый график погоды по дням. Переходы — {transitions.length} шт. за {totalTime} дней.
        </Text>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, totalTime]}
              tickCount={10}
              label={{ value: 'День', position: 'insideBottom', offset: -12, fontSize: 12 }}
            />
            <YAxis
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              tickFormatter={v => STATES[v - 1]?.emoji ?? v}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="stepAfter"
              dataKey="state"
              stroke="#339AF0"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {/* Легенда состояний */}
        <Group gap="lg" justify="center">
          {STATES.map(s => (
            <Group key={s.id} gap={4}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: s.hex }} />
              <Text size="xs">{s.id} — {s.emoji} {s.name}</Text>
            </Group>
          ))}
        </Group>
      </Stack>
    </Card>
  )
}

// ─── Компонент: Распределение (эмп. vs теор.) ────────────────────────────────

function DistributionSection({ data }) {
  const barData = STATES.map((s, i) => ({
    name: `${s.emoji} ${s.name}`,
    'Эмп. π̂': parseFloat(data.empPi[i].toFixed(4)),
    'Теор. π':  parseFloat(data.theoPi[i].toFixed(4)),
  }))

  // RingProgress для быстрого визуального сравнения
  const rings = STATES.map((s, i) => ({
    ...s,
    emp:  data.empPi[i],
    theo: data.theoPi[i],
  }))

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Стационарное распределение</Title>
        <Text size="sm" c="dimmed">
          Сравнение эмпирического π̂ (доля времени в состоянии) с теоретическим π (решение π·Q = 0).
        </Text>

        <Grid gutter="md">
          {/* Кольца */}
          <Grid.Col span={{ base: 12, sm: 5 }}>
            <Group justify="space-around">
              {rings.map(s => (
                <Stack key={s.id} align="center" gap={2}>
                  <RingProgress
                    size={100}
                    thickness={10}
                    roundCaps
                    sections={[
                      { value: s.emp * 100,  color: s.colorKey + '.5', tooltip: `Эмп.: ${fmt(s.emp, 3)}` },
                    ]}
                    label={<Text ta="center" size="lg">{s.emoji}</Text>}
                  />
                  <Text size="xs" fw={600}>{s.name}</Text>
                  <Text size="xs" c="dimmed">π̂={fmt(s.emp, 3)}</Text>
                  <Text size="xs" c="dimmed">π ={fmt(s.theo, 3)}</Text>
                </Stack>
              ))}
            </Group>
          </Grid.Col>

          {/* Столбчатая диаграмма */}
          <Grid.Col span={{ base: 12, sm: 7 }}>
            <BarChart
              h={220}
              data={barData}
              dataKey="name"
              series={[
                { name: 'Эмп. π̂', color: 'blue.5' },
                { name: 'Теор. π',  color: 'orange.5' },
              ]}
              withLegend
              legendProps={{ verticalAlign: 'top' }}
              yAxisProps={{ domain: [0, 1], tickCount: 6 }}
            />
          </Grid.Col>
        </Grid>

        {/* Числовая таблица */}
        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Состояние</Table.Th>
                <Table.Th>Теор. π_i</Table.Th>
                <Table.Th>Эмп. π̂_i</Table.Th>
                <Table.Th>|π̂_i − π_i|</Table.Th>
                <Table.Th>E_i = T·π_i (дн.)</Table.Th>
                <Table.Th>O_i (дн.)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {STATES.map((s, i) => {
                const diff = Math.abs(data.empPi[i] - data.theoPi[i])
                const expected = data.theoPi[i] * data.totalTime
                return (
                  <Table.Tr key={s.id}>
                    <Table.Td>{s.emoji} {s.name}</Table.Td>
                    <Table.Td><Code>{fmt(data.theoPi[i], 4)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(data.empPi[i], 4)}</Code></Table.Td>
                    <Table.Td>
                      <Code style={{ color: diff > 0.05 ? '#e03131' : '#2f9e44' }}>
                        {fmt(diff, 4)}
                      </Code>
                    </Table.Td>
                    <Table.Td><Code>{fmt(expected, 2)}</Code></Table.Td>
                    <Table.Td><Code>{fmt(data.timeInState[i], 2)}</Code></Table.Td>
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

// ─── Компонент: Статистика по состояниям ─────────────────────────────────────

function StatsSection({ data }) {
  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Статистика по состояниям</Title>
        <ScrollArea>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Состояние</Table.Th>
                <Table.Th>Визитов</Table.Th>
                <Table.Th>Время (дн.)</Table.Th>
                <Table.Th>Доля времени</Table.Th>
                <Table.Th>Ср. длит. (эмп.)</Table.Th>
                <Table.Th>Ср. длит. (теор.) 1/|Q_ii|</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {STATES.map((s, i) => (
                <Table.Tr key={s.id}>
                  <Table.Td fw={600}>{s.emoji} {s.name}</Table.Td>
                  <Table.Td><Code>{data.visitsToState[i]}</Code></Table.Td>
                  <Table.Td><Code>{fmt(data.timeInState[i], 2)}</Code></Table.Td>
                  <Table.Td>
                    <Badge color={s.colorKey} variant="light">
                      {(data.empPi[i] * 100).toFixed(1)}%
                    </Badge>
                  </Table.Td>
                  <Table.Td><Code>{fmt(data.avgDuration[i], 3)}</Code></Table.Td>
                  <Table.Td><Code>{fmt(data.theoAvgDur[i], 3)}</Code></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td fw={600}>Итого</Table.Td>
                <Table.Td fw={600}>{data.visitsToState.reduce((a, b) => a + b, 0)}</Table.Td>
                <Table.Td fw={600}>{data.totalTime}</Table.Td>
                <Table.Td fw={600}>100%</Table.Td>
                <Table.Td colSpan={2} />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea>
      </Stack>
    </Card>
  )
}

// ─── Компонент: Матрица-генератор ─────────────────────────────────────────────

function MatrixSection({ data }) {
  const q = data.generator
  const cellStyle = (i, j) => ({
    color: i === j ? '#e03131' : '#1c7ed6',
    fontFamily: 'monospace',
  })

  return (
    <Card withBorder shadow="sm" radius="md" padding="lg">
      <Stack gap="md">
        <Title order={3}>Матрица-генератор Q и интенсивности λᵢⱼ</Title>
        <Grid gutter="md">
          {/* Матрица генератора */}
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Text fw={600} size="sm" mb="xs">Генератор Q (Q[i][i] = −Σλᵢⱼ):</Text>
            <Table withTableBorder withColumnBorders fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Q</Table.Th>
                  {STATES.map(s => <Table.Th key={s.id} ta="center">{s.emoji}</Table.Th>)}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {STATES.map((rs, i) => (
                  <Table.Tr key={rs.id}>
                    <Table.Td fw={600}>{rs.emoji}</Table.Td>
                    {STATES.map((cs, j) => (
                      <Table.Td key={cs.id} ta="center">
                        <span style={cellStyle(i, j)}>
                          {i === j ? fmt(q[i][j], 3) : fmt(q[i][j], 3)}
                        </span>
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Grid.Col>

          {/* Матрица интенсивностей */}
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Text fw={600} size="sm" mb="xs">Интенсивности λᵢⱼ (i≠j):</Text>
            <Table withTableBorder withColumnBorders fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>λᵢⱼ</Table.Th>
                  {STATES.map(s => <Table.Th key={s.id} ta="center">{s.emoji}</Table.Th>)}
                  <Table.Th ta="center">|Q_ii|</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {STATES.map((rs, i) => (
                  <Table.Tr key={rs.id}>
                    <Table.Td fw={600}>{rs.emoji}</Table.Td>
                    {STATES.map((cs, j) => (
                      <Table.Td key={cs.id} ta="center">
                        {i === j
                          ? <Text c="dimmed" size="xs">—</Text>
                          : <Code>{fmt(data.rates[i][j], 2)}</Code>
                        }
                      </Table.Td>
                    ))}
                    <Table.Td ta="center">
                      <Code style={{ color: '#e03131' }}>{fmt(Math.abs(q[i][i]), 3)}</Code>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed" mt={4}>
              Ср. время в состоянии i = 1/|Q_ii| (теоретическое)
            </Text>
          </Grid.Col>
        </Grid>

        {/* Формула стационарного распределения */}
        <Paper withBorder p="sm" radius="md" bg="blue.0">
          <Text fw={600} size="sm" mb={4}>Расчёт стационарного распределения:</Text>
          <Code block fz={11}>{[
            '// Система уравнений π·Q = 0 + нормировка Σπᵢ = 1:',
            `// [${fmt(q[0][0],3)}, ${fmt(q[1][0],3)}, ${fmt(q[2][0],3)}] [π₁]   [0]`,
            `// [${fmt(q[0][1],3)}, ${fmt(q[1][1],3)}, ${fmt(q[2][1],3)}] [π₂] = [0]`,
            `// [ 1.000,  1.000,  1.000] [π₃]   [1]`,
            `//`,
            `// Решение: π₁=${fmt(data.theoPi[0],4)},  π₂=${fmt(data.theoPi[1],4)},  π₃=${fmt(data.theoPi[2],4)}`,
            `// Проверка: Σπᵢ = ${(data.theoPi[0]+data.theoPi[1]+data.theoPi[2]).toFixed(6)}`,
          ].join('\n')}</Code>
        </Paper>
      </Stack>
    </Card>
  )
}

// ─── Утилита: экспорт в CSV ───────────────────────────────────────────────────

function exportCSV(data) {
  const rows = []

  // 1. Сводка эксперимента
  rows.push(['=== СВОДКА ЭКСПЕРИМЕНТА ==='])
  rows.push(['Горизонт (дни)', data.totalTime])
  rows.push(['χ²', data.chi2.toFixed(6)])
  rows.push(['χ²крит (df=2, α=0.05)', data.chi2Crit.toFixed(6)])
  rows.push(['Результат теста', data.chi2Pass ? 'H₀ не отвергается' : 'H₀ отвергается'])
  rows.push([])

  // 2. Стационарное распределение
  rows.push(['=== СТАЦИОНАРНОЕ РАСПРЕДЕЛЕНИЕ ==='])
  rows.push(['Состояние', 'Теор. πᵢ', 'Эмп. π̂ᵢ', '|π̂ᵢ − πᵢ|', 'E_i = T·πᵢ (дн.)', 'O_i (дн.)'])
  STATES.forEach((s, i) => {
    rows.push([
      s.name,
      data.theoPi[i].toFixed(6),
      data.empPi[i].toFixed(6),
      Math.abs(data.empPi[i] - data.theoPi[i]).toFixed(6),
      (data.theoPi[i] * data.totalTime).toFixed(4),
      data.timeInState[i].toFixed(4),
    ])
  })
  rows.push([])

  // 3. Статистика по состояниям
  rows.push(['=== СТАТИСТИКА ПО СОСТОЯНИЯМ ==='])
  rows.push(['Состояние', 'Визитов', 'Время (дн.)', 'Доля времени', 'Ср. длит. эмп. (дн.)', 'Ср. длит. теор. 1/|Q_ii| (дн.)'])
  STATES.forEach((s, i) => {
    rows.push([
      s.name,
      data.visitsToState[i],
      data.timeInState[i].toFixed(4),
      data.empPi[i].toFixed(6),
      data.avgDuration[i].toFixed(4),
      data.theoAvgDur[i].toFixed(4),
    ])
  })
  rows.push([])

  // 4. Матрица-генератор Q
  rows.push(['=== МАТРИЦА-ГЕНЕРАТОР Q ==='])
  rows.push(['Q', ...STATES.map(s => s.name)])
  STATES.forEach((rs, i) => {
    rows.push([rs.name, ...STATES.map((_, j) => data.generator[i][j].toFixed(4))])
  })
  rows.push([])

  // 5. Интенсивности λᵢⱼ
  rows.push(['=== ИНТЕНСИВНОСТИ λᵢⱼ ==='])
  rows.push(['λᵢⱼ', ...STATES.map(s => s.name), '|Q_ii|'])
  STATES.forEach((rs, i) => {
    rows.push([
      rs.name,
      ...STATES.map((_, j) => (i === j ? '' : data.rates[i][j].toFixed(4))),
      Math.abs(data.generator[i][i]).toFixed(4),
    ])
  })
  rows.push([])

  // 6. Переходы (траектория)
  rows.push(['=== ПЕРЕХОДЫ (ТРАЕКТОРИЯ) ==='])
  rows.push(['#', 'Состояние', 'Название', 'Вход (дн.)', 'Выход (дн.)', 'Длительность (дн.)'])
  data.transitions.forEach((tr, idx) => {
    rows.push([
      idx + 1,
      tr.state,
      STATES[tr.state - 1].name,
      tr.enterTime.toFixed(6),
      tr.exitTime.toFixed(6),
      tr.duration.toFixed(6),
    ])
  })

  // Сборка CSV строки (разделитель ; для совместимости с Excel)
  const csv = rows
    .map(row => row.map(cell => {
      const s = String(cell)
      return s.includes(';') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }).join(';'))
    .join('\r\n')

  const bom = '\uFEFF' // BOM для корректного отображения кириллицы в Excel
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `markov_weather_T${data.totalTime}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Главный компонент ────────────────────────────────────────────────────────

const DEFAULT_RATES = { l12: 0.5, l13: 0.2, l21: 0.4, l23: 0.3, l31: 0.1, l32: 0.5 }

export default function App() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Параметры: интенсивности переходов
  const [rates, setRates] = useState(DEFAULT_RATES)
  const [days,  setDays]  = useState(60)

  const setRate = (key, val) =>
    setRates(prev => ({ ...prev, [key]: val }))

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const { l12, l13, l21, l23, l31, l32 } = rates
      const url = `/api/simulate?l12=${l12}&l13=${l13}&l21=${l21}&l23=${l23}&l31=${l31}&l32=${l32}&days=${days}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run() }, [])

  return (
    <MantineProvider>
      <Container size="xl" py="xl">
        <Stack gap="xl">

          {/* ─── Заголовок ─────────────────────────────────────── */}
          <div>
            <Title order={1}>Лабораторная работа №7</Title>
            <Text c="dimmed" mt={4} size="lg">
              Марковская модель погоды — непрерывная цепь Маркова (CTMC)
            </Text>
          </div>

          {/* ─── Алгоритм (справка) ────────────────────────────── */}
          <Paper withBorder p="md" radius="md" bg="blue.0">
            <Text fw={600} size="sm" mb={4}>Алгоритм Гиллеспи (Gillespie / SSA):</Text>
            <Code block fz={12}>{[
              '// Состояния: 1=Ясно ☀️  2=Облачно ⛅  3=Пасмурно ☁️',
              '//',
              '// В состоянии i с суммарной интенсивностью λᵢ = −Q[i][i]:',
              '//   ✦ U₁ ~ U(0,1)  →  T = −ln(U₁) / λᵢ  (время пребывания ~ Exp(λᵢ))',
              '//   ✦ U₂ ~ U(0,1)  →  следующее состояние j: P(j) = λᵢⱼ / λᵢ',
              '//',
              '// Стационарное π: π·Q = 0, Σπᵢ=1  →  метод Гаусса',
              '// Критерий: χ² = Σ(tᵢ − T·πᵢ)²/(T·πᵢ),  df=2,  χ²крит=5.991',
            ].join('\n')}</Code>
          </Paper>

          {/* ─── Параметры ─────────────────────────────────────── */}
          <Card withBorder shadow="sm" radius="md" padding="lg" bg="gray.0">
            <Stack gap="sm">
              <Title order={3}>Параметры моделирования</Title>
              <Text size="sm" c="dimmed">
                Задайте интенсивности переходов λᵢⱼ (1/дни) между состояниями.
              </Text>

              {/* Матрица ввода интенсивностей */}
              <Grid gutter="xs">
                {[
                  { key: 'l12', label: 'λ₁₂', from: '☀️ Ясно',    to: '⛅ Облачно' },
                  { key: 'l13', label: 'λ₁₃', from: '☀️ Ясно',    to: '☁️ Пасмурно' },
                  { key: 'l21', label: 'λ₂₁', from: '⛅ Облачно',  to: '☀️ Ясно' },
                  { key: 'l23', label: 'λ₂₃', from: '⛅ Облачно',  to: '☁️ Пасмурно' },
                  { key: 'l31', label: 'λ₃₁', from: '☁️ Пасмурно',to: '☀️ Ясно' },
                  { key: 'l32', label: 'λ₃₂', from: '☁️ Пасмурно',to: '⛅ Облачно' },
                ].map(({ key, label, from, to }) => (
                  <Grid.Col key={key} span={{ base: 6, sm: 4, md: 2 }}>
                    <NumberInput
                      label={label}
                      description={`${from} → ${to}`}
                      value={rates[key]}
                      onChange={v => setRate(key, Number(v) || 0)}
                      min={0}
                      step={0.1}
                      decimalScale={2}
                    />
                  </Grid.Col>
                ))}
                <Grid.Col span={{ base: 6, sm: 4, md: 2 }}>
                  <NumberInput
                    label="Дней T"
                    description="Горизонт (дни)"
                    value={days}
                    onChange={v => setDays(Number(v) || 60)}
                    min={10}
                    max={3650}
                    step={10}
                  />
                </Grid.Col>
              </Grid>

              <Button onClick={run} loading={loading} w={220} mt={4}>
                Запустить моделирование
              </Button>
            </Stack>
          </Card>

          {error && (
            <Text c="red">Ошибка: {error}. Запущен ли бэкенд на порту 8087?</Text>
          )}

          {loading && !data && (
            <Center h={200}><Loader /></Center>
          )}

          {/* ─── Результаты ────────────────────────────────────── */}
          {data && (
            <>
              {/* Критерий χ² */}
              <Paper
                withBorder p="sm" radius="md"
                bg={data.chi2Pass ? 'green.0' : 'red.0'}
                style={{ borderColor: data.chi2Pass ? '#2f9e44' : '#e03131' }}
              >
                <Group justify="space-between" wrap="wrap">
                  <Group gap="xs">
                    <Badge color={data.chi2Pass ? 'green' : 'red'} size="lg">
                      {data.chi2Pass ? '✓ H₀ не отвергается' : '✗ H₀ отвергается'}
                    </Badge>
                    <Text size="sm">α = 0.05,  df = 2</Text>
                  </Group>
                  <Code>
                    χ² = {fmt(data.chi2, 3)}  χ²крит = {fmt(data.chi2Crit, 3)}
                  </Code>
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  {data.chi2Pass
                    ? `χ² = ${fmt(data.chi2, 3)} < ${fmt(data.chi2Crit, 3)} → эмпирическое распределение согласуется с теоретическим`
                    : `χ² = ${fmt(data.chi2, 3)} ≥ ${fmt(data.chi2Crit, 3)} → расхождение статистически значимо`
                  }
                </Text>
              </Paper>

              {/* Экспорт CSV */}
              <Group justify="flex-end">
                <Button
                  variant="outline"
                  color="teal"
                  onClick={() => exportCSV(data)}
                >
                  ⬇ Экспорт CSV
                </Button>
              </Group>

              {/* Анимация */}
              <AnimationSection data={data} />

              {/* Временной ряд */}
              <TimelineSection
                transitions={data.transitions}
                totalTime={data.totalTime}
              />

              {/* Распределение */}
              <DistributionSection data={data} />

              <Grid gutter="md">
                {/* Статистика */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <StatsSection data={data} />
                </Grid.Col>
                {/* Матрица */}
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <MatrixSection data={data} />
                </Grid.Col>
              </Grid>
            </>
          )}
        </Stack>
      </Container>
    </MantineProvider>
  )
}
