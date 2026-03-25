// Главный компонент лабораторной работы №4 — Базовый датчик случайных чисел.
//
// Отображает:
//  - параметры ЛКГ (линейного конгруэнтного генератора)
//  - таблицу сравнения выборочных и теоретических характеристик
//  - гистограммы распределения обоих генераторов
//  - вычисленное относительное отклонение от теоретических значений

import { useState, useEffect, useCallback } from 'react'
import {
  MantineProvider,
  Container,
  Title,
  Text,
  Stack,
  Card,
  Table,
  Button,
  Alert,
  Grid,
  Badge,
  Group,
  Divider,
  Code,
  Loader,
  Center,
} from '@mantine/core'
import { BarChart } from '@mantine/charts'
import './App.css'

// ─── Вспомогательные функции ───────────────────────────────────────────────

/**
 * Вычисляет относительное отклонение выборочного значения от теоретического (в %).
 * @param {number} sample  — выборочное значение
 * @param {number} theory  — теоретическое значение
 * @returns {string} строка «±X.XXXX %»
 */
function relDev(sample, theory) {
  return (((sample - theory) / theory) * 100).toFixed(4)
}

/**
 * Преобразует массив HistogramBin (из Go-API) в формат данных для BarChart Mantine.
 * @param {Array} histogram — массив корзин [{min, max, count, freq}]
 * @returns {Array} массив объектов {label, частота}
 */
function toChartData(histogram) {
  return histogram.map((bin, i) => ({
    // Метка показывает только каждый 5-й столбец, чтобы не перегружать ось X
    label: i % 5 === 0 ? bin.min.toFixed(2) : '',
    частота: parseFloat(bin.freq.toFixed(5)),
  }))
}

// ─── Компонент: карточка одного генератора ──────────────────────────────────

/**
 * StatCard — карточка со статистическими характеристиками одного генератора
 * и гистограммой его распределения.
 */
function StatCard({ title, stats, theoretical, color, barColor }) {
  const chartData = toChartData(stats.histogram)

  // Теоретическое ожидаемое значение частоты при равномерном распределении —
  // 1 / NumBins = 1/30 ≈ 0.03333
  const expectedFreq = 1 / stats.histogram.length

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
      <Stack gap="md">
        <Text fw={700} size="lg" c={color}>
          {title}
        </Text>

        {/* Таблица характеристик */}
        <Table striped highlightOnHover withTableBorder withColumnBorders fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Характеристика</Table.Th>
              <Table.Th>Выборочное</Table.Th>
              <Table.Th>Теоретическое</Table.Th>
              <Table.Th>Отклонение</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {/* Среднее */}
            <Table.Tr>
              <Table.Td>Среднее (μ)</Table.Td>
              <Table.Td>{stats.mean.toFixed(6)}</Table.Td>
              <Table.Td>{theoretical.mean.toFixed(6)}</Table.Td>
              <Table.Td>
                <DeviationBadge value={relDev(stats.mean, theoretical.mean)} />
              </Table.Td>
            </Table.Tr>
            {/* Дисперсия */}
            <Table.Tr>
              <Table.Td>Дисперсия (σ²)</Table.Td>
              <Table.Td>{stats.variance.toFixed(6)}</Table.Td>
              <Table.Td>{theoretical.variance.toFixed(6)}</Table.Td>
              <Table.Td>
                <DeviationBadge value={relDev(stats.variance, theoretical.variance)} />
              </Table.Td>
            </Table.Tr>
            {/* СКО */}
            <Table.Tr>
              <Table.Td>СКО (σ)</Table.Td>
              <Table.Td>{stats.stdDev.toFixed(6)}</Table.Td>
              <Table.Td>{theoretical.stdDev.toFixed(6)}</Table.Td>
              <Table.Td>
                <DeviationBadge value={relDev(stats.stdDev, theoretical.stdDev)} />
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>

        {/* Гистограмма распределения */}
        <Text size="sm" c="dimmed">
          Гистограмма распределения (30 интервалов)
        </Text>
        <BarChart
          h={220}
          data={chartData}
          dataKey="label"
          series={[{ name: 'частота', color: barColor }]}
          // Опорная линия — ожидаемая равномерная частота каждой корзины
          referenceLines={[
            {
              y: expectedFreq,
              label: 'Теория',
              color: 'red.6',
            },
          ]}
          yAxisProps={{ tickFormatter: (v) => v.toFixed(3) }}
          tooltipProps={{ formatter: (v) => [v.toFixed(5), 'Частота'] }}
        />
      </Stack>
    </Card>
  )
}

// ─── Компонент: бейдж отклонения ────────────────────────────────────────────

/**
 * DeviationBadge — цветной бейдж с процентным отклонением.
 * < 0.5 % → зелёный, иначе → жёлтый.
 */
function DeviationBadge({ value }) {
  const abs = Math.abs(parseFloat(value))
  const color = abs < 0.5 ? 'green' : 'yellow'
  const sign = parseFloat(value) >= 0 ? '+' : ''
  return (
    <Badge color={color} variant="light" size="sm">
      {sign}{value} %
    </Badge>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function App() {
  // Данные с Go-бэкенда: {sampleSize, lcg, builtin, theoretical, lcgParams}
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Запрашиваем данные у Go-сервера
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/generate')
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Загружаем данные при первом рендере
  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <MantineProvider>
      <Container size="xl" py="xl">
        <Stack gap="xl">

          {/* Заголовок */}
          <div>
            <Title order={1}>Лабораторная работа №4</Title>
            <Text c="dimmed" mt={4} size="lg">
              Базовый датчик случайных чисел — статистический анализ
            </Text>
          </div>

          {/* Описание метода */}
          <Card withBorder shadow="sm" radius="md" padding="lg">
            <Title order={3} mb="sm">Метод: Линейный конгруэнтный генератор (ЛКГ)</Title>
            <Text size="sm" mb="xs">
              Псевдослучайные числа генерируются по рекуррентной формуле:
            </Text>
            <div className="formula-block">
              X₍ₙ₊₁₎ = (a · Xₙ) mod m{'\n'}
              {data
                ? `a = ${data.lcgParams.a},  m = ${data.lcgParams.m} (= 2³¹ − 1),  seed = ${data.lcgParams.seed}`
                : 'a = 16807,  m = 2147483647 (= 2³¹ − 1),  seed = 42'}
              {'\n'}
              uₙ = Xₙ / m  ∈ [0, 1)
            </div>
            <Text size="sm" mt="sm" c="dimmed">
              Генератор Парка-Миллера — классический мультипликативный ЛКГ с полным
              периодом m − 1 = 2 147 483 646. Результаты нормируются делением на m,
              что даёт числа из интервала [0, 1).
            </Text>
          </Card>

          {/* Кнопка перегенерации */}
          <Group>
            <Button onClick={fetchData} loading={loading} size="md">
              Перегенерировать выборку
            </Button>
            {data && (
              <Text size="sm" c="dimmed">
                Размер выборки:{' '}
                <strong>{data.sampleSize.toLocaleString('ru-RU')}</strong> значений
              </Text>
            )}
          </Group>

          {/* Ошибка */}
          {error && (
            <Alert color="red" title="Ошибка соединения" radius="md">
              {error}
            </Alert>
          )}

          {/* Состояние загрузки */}
          {loading && !data && (
            <Center py="xl">
              <Loader size="lg" />
            </Center>
          )}

          {/* Основное содержимое */}
          {data && (
            <>
              {/* Карточки генераторов */}
              <Grid gutter="md">
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <StatCard
                    title="ЛКГ — реализованный генератор"
                    stats={data.lcg}
                    theoretical={data.theoretical}
                    color="blue.7"
                    barColor="blue.5"
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <StatCard
                    title="Встроенный генератор Go (rand.Float64)"
                    stats={data.builtin}
                    theoretical={data.theoretical}
                    color="teal.7"
                    barColor="teal.5"
                  />
                </Grid.Col>
              </Grid>

              <Divider label="Сводная таблица сравнения" labelPosition="center" />

              {/* Сводная таблица */}
              <Card withBorder shadow="sm" radius="md" padding="lg">
                <Title order={3} mb="md">
                  Сводная таблица: выборочные vs теоретические значения
                </Title>
                <Text size="sm" c="dimmed" mb="md">
                  Теоретические значения для равномерного распределения U[0, 1]:
                  μ = 0.5, σ² = 1/12, σ = 1/√12
                </Text>
                <Table
                  striped
                  highlightOnHover
                  withTableBorder
                  withColumnBorders
                  fz="sm"
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Характеристика</Table.Th>
                      <Table.Th>ЛКГ</Table.Th>
                      <Table.Th>Встроенный Go</Table.Th>
                      <Table.Th>Теоретическое</Table.Th>
                      <Table.Th>Откл. ЛКГ</Table.Th>
                      <Table.Th>Откл. Go</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td fw={500}>Среднее (μ)</Table.Td>
                      <Table.Td>
                        <Code>{data.lcg.mean.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Code>{data.builtin.mean.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Code>{data.theoretical.mean.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <DeviationBadge value={relDev(data.lcg.mean, data.theoretical.mean)} />
                      </Table.Td>
                      <Table.Td>
                        <DeviationBadge value={relDev(data.builtin.mean, data.theoretical.mean)} />
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={500}>Дисперсия (σ²)</Table.Td>
                      <Table.Td>
                        <Code>{data.lcg.variance.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Code>{data.builtin.variance.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Code>{data.theoretical.variance.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <DeviationBadge value={relDev(data.lcg.variance, data.theoretical.variance)} />
                      </Table.Td>
                      <Table.Td>
                        <DeviationBadge value={relDev(data.builtin.variance, data.theoretical.variance)} />
                      </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td fw={500}>СКО (σ)</Table.Td>
                      <Table.Td>
                        <Code>{data.lcg.stdDev.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Code>{data.builtin.stdDev.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Code>{data.theoretical.stdDev.toFixed(6)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <DeviationBadge value={relDev(data.lcg.stdDev, data.theoretical.stdDev)} />
                      </Table.Td>
                      <Table.Td>
                        <DeviationBadge value={relDev(data.builtin.stdDev, data.theoretical.stdDev)} />
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              </Card>

              {/* Выводы */}
              <Card withBorder shadow="sm" radius="md" padding="lg" bg="gray.0">
                <Title order={3} mb="sm">
                  Выводы
                </Title>
                <Stack gap="xs">
                  <Text size="sm">
                    • Оба генератора — ЛКГ и встроенный Go — демонстрируют выборочные
                    среднее и дисперсию, близкие к теоретическим значениям
                    равномерного распределения U[0, 1] (μ = 0.5, σ² ≈ 0.0833).
                  </Text>
                  <Text size="sm">
                    • Относительное отклонение от теории при N = 100 000 не превышает
                    1 %, что соответствует закону больших чисел.
                  </Text>
                  <Text size="sm">
                    • Гистограммы обоих генераторов близки к равномерному
                    распределению: все столбцы имеют частоту ≈ 1/30 ≈ 0.0333, что
                    подтверждает отсутствие систематических смещений.
                  </Text>
                  <Text size="sm">
                    • ЛКГ Парка-Миллера, несмотря на простоту реализации,
                    обеспечивает статистические характеристики, сопоставимые с
                    качеством встроенного ГПСЧ Go (LFSR + Wyrand).
                  </Text>
                </Stack>
              </Card>
            </>
          )}
        </Stack>
      </Container>
    </MantineProvider>
  )
}
