
import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList
} from "recharts";

const INTERVALO_ATUALIZACAO = 60000;

export default function App() {
  /* ===============================
      ESTADOS
  =============================== */
  const [dados, setDados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("Alimentação:Café da Manhã");

  const [mesesAnos, setMesesAnos] = useState([]);
  const [mesAnoSelecionado, setMesAnoSelecionado] = useState("Janeiro/2026");

  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [proximaAtualizacao, setProximaAtualizacao] = useState(null);
  const [tempoRestante, setTempoRestante] = useState(0);
  const [modo, setModo] = useState("diario");
  const [showLabels, setShowLabels] = useState(false);

  /* ===============================
      FETCH COMBOS (Categorias e Meses)
  =============================== */
  useEffect(() => {
    // 1. Categorias
    fetch("http://api.financeiro.arielgiacomini.com.br/v1/category/search?enable=true")
      .then(res => res.json())
      .then(setCategorias)
      .catch(console.error);

    // 2. Meses/Anos (Header: startYear / Query: endYear)
    const anoAtual = new Date().getFullYear();
    fetch(`http://api.financeiro.arielgiacomini.com.br/v1/date/month-year-all?endYear=${anoAtual}`, {
      method: 'GET',
      headers: {
        "startYear": "2025",
        "Content-Type": "application/json"
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.monthYears) {
          setMesesAnos(data.monthYears);
        }
      })
      .catch(console.error);
  }, []);

  /* ===============================
      FETCH DASHBOARD (Dados do Gráfico)
  =============================== */
  useEffect(() => {
    function buscarDashboard() {
      const agora = new Date();
      const url = `http://api.financeiro.arielgiacomini.com.br/v1/dashboard/billToPay-day-week-category?categoria=${encodeURIComponent(categoriaSelecionada)}`;

      fetch(url, {
        headers: {
          mesAno: mesAnoSelecionado, // Header dinâmico para o filtro
          "Cache-Control": "no-cache"
        }
      })
        .then(res => res.json())
        .then(data => {
          setDados(data);
          setUltimaAtualizacao(agora);
          setProximaAtualizacao(new Date(agora.getTime() + INTERVALO_ATUALIZACAO));

          // Sempre que novos dados chegam, reiniciamos a animação dos labels
          setShowLabels(false);
          setTimeout(() => setShowLabels(true), 1600);
        })
        .catch(console.error);
    }

    buscarDashboard();
    const interval = setInterval(buscarDashboard, INTERVALO_ATUALIZACAO);
    return () => clearInterval(interval);
  }, [categoriaSelecionada, mesAnoSelecionado]); // Recarrega ao mudar qualquer filtro

  /* ===============================
      LÓGICA DE LABELS (Modo)
  =============================== */
  useEffect(() => {
    setShowLabels(false);
    const timer = setTimeout(() => setShowLabels(true), 1600);
    return () => clearTimeout(timer);
  }, [modo]);

  /* ===============================
      COUNTDOWN
  =============================== */
  useEffect(() => {
    if (!proximaAtualizacao) return;
    const timer = setInterval(() => {
      const diff = proximaAtualizacao.getTime() - Date.now();
      setTempoRestante(Math.max(diff, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [proximaAtualizacao]);

  /* ===============================
      HELPERS E PROCESSAMENTO
  =============================== */
  const formatarHora = d => d ? d.toLocaleTimeString("pt-BR") : "--:--:--";
  const formatarCountdown = ms => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const formatarData = d => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const extrairNumeroSemana = w => Number(w?.match(/\d+/)?.[0]) || 0;

  const dadosPorMes = {};
  dados.forEach(item => {
    if (!dadosPorMes[item.monthYear]) dadosPorMes[item.monthYear] = [];
    if (modo === "diario") {
      dadosPorMes[item.monthYear].push({
        label: formatarData(item.date),
        data: new Date(item.date),
        valor: Number(item.valueSpent) || 0,
        isCurrentWeek: item.currentWeek
      });
    } else {
      const semanaNum = extrairNumeroSemana(item.weekName);
      let semana = dadosPorMes[item.monthYear].find(s => s.numeroSemana === semanaNum);
      if (!semana) {
        semana = { numeroSemana: semanaNum, label: item.weekName, valor: 0, isCurrentWeek: false };
        dadosPorMes[item.monthYear].push(semana);
      }
      semana.valor += Number(item.valueSpent) || 0;
      if (item.currentWeek) semana.isCurrentWeek = true;
    }
  });

  Object.values(dadosPorMes).forEach(lista => {
    lista.sort((a, b) => modo === "diario" ? a.data - b.data : a.numeroSemana - b.numeroSemana);
  });

  const CustomDot = props => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined) return null;
    return (
      <circle cx={cx} cy={cy} r={payload.isCurrentWeek ? 7 : 4}
        fill={payload.isCurrentWeek ? "#fbff00" : "#ff0000"}
        stroke="#ff0000" strokeWidth={payload.isCurrentWeek ? 2 : 0} />
    );
  };

  /* ===============================
      CÁLCULOS DE KPI (Total e Média)
  =============================== */
  const { totalGasto, media, projecao } = useMemo(() => {
    // 1. Verificamos se 'dados' existe e é uma lista
    if (!Array.isArray(dados) || dados.length === 0) {
      return { totalGasto: 0, media: 0, projecao: 0 };
    }

    // 2. Calculamos o total somando a propriedade valueSpent de cada item
    const total = dados.reduce((acc, item) => {
      const valor = Number(item.valueSpent) || 0;
      return acc + valor;
    }, 0);

    // 3. Calculamos a média baseada no modo
    // Se for diário, divide pelo número de dias retornados. Se semanal, pelo número de semanas.
    const divisor = modo === "diario" ? dados.length : (dados.length / 7 || 1);
    const avg = total / (divisor || 1);

    // 4. Projeção simples para o mês (ex: 30 dias)
    const proj = modo === "diario" ? (avg * 30) : (avg * 4);

    return {
      totalGasto: total,
      media: avg,
      projecao: proj
    };
  }, [dados, modo]);

  return (
    <div
      className="bg-zinc-950 min-h-screen text-white p-6">
      {/* HEADER */}
      <div className="flex justify-between items-start mb-10">
        <h1 className="text-4xl font-bold">📊 Controle Financeiro</h1>
        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-sm text-zinc-400">
          <div>🕒 Última atualização: <span className="text-white font-mono">{formatarHora(ultimaAtualizacao)}</span></div>
          <div>⏭️ Próxima em: <span className="text-green-500 font-mono">{formatarCountdown(tempoRestante)}</span></div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-6 mb-10 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-900">
        <div className="flex flex-col gap-2">
          <label className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Categoria: </label>
          <select
            value={categoriaSelecionada}
            onChange={e => setCategoriaSelecionada(e.target.value)}
            className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 min-w-[280px] focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Mês/Ano: </label>
          <select
            value={mesAnoSelecionado}
            onChange={e => setMesAnoSelecionado(e.target.value)}
            className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            {mesesAnos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* TOGGLE MODO */}
      <div className="mb-10 flex gap-4">
        {["semanal", "diario"].map(m => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`px-8 py-2 rounded-xl font-bold transition-all ${modo === m ? "bg-green-600 shadow-lg shadow-green-900/20" : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
          >
            {m === "semanal" ? "Semanal" : "Diário"}
          </button>
        ))}
      </div>

      {/* GRÁFICOS */}
      {
        Object.entries(dadosPorMes).map(([mesAno, linhas]) => (
          <div key={mesAno}
            style={{ margin: 1, backgroundColor: "#ffffffe7" }}>
            <div style={{ width: '100%', height: 400, minWidth: 0 }}>
              <div style={{ textAlign: "center" }}>
                <h3>Gastos {modo === "diario" ? "Diários" : "Semanais"} de {mesAno}</h3>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={linhas} margin={{ top: 60, right: 80, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" stroke="#52525b" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#525253" tick={{ fontSize: 13 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #3f3f3f', borderRadius: '12px' }}
                    formatter={v => `R$ ${v.toFixed(2)} ${v.isCurrentWeek === true ? 'é a Semana Atual' : ''}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="#ef4444"
                    strokeWidth={4}
                    dot={<CustomDot />}
                    isAnimationActive={false}
                  >
                    {showLabels && (
                      <LabelList
                        dataKey="valor"
                        position="right"
                        offset={15}
                        stroke="#000000"
                        fontSize={13}
                        formatter={(v) => v > 0 ? `R$ ${v.toFixed(2).replace(".", ",")}` : ''}
                      />
                    )}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* SEÇÃO DE KPIS COM CSS INLINE PARA GARANTIR ESTILIZAÇÃO */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
              marginBottom: '40px',
              marginTop: '20px',
              fontFamily: 'sans-serif'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '20px',
                width: '100%',
                maxWidth: '1100px',
                padding: '0 20px'
              }}>

                {/* Card 1: Total Gasto */}
                <div style={{
                  backgroundColor: '#2d343c',
                  padding: '10px',
                  borderRadius: '24px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '150px'
                }}>
                  <h3 style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '1px' }}>Total Gasto</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <p style={{ color: 'white', fontSize: '28px', fontWeight: '900', margin: 0 }}>
                      {totalGasto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    <span style={{ color: '#34d399', fontSize: '24px', fontWeight: 'bold' }}>↑</span>
                  </div>
                </div>

                {/* Card 2: Média */}
                <div style={{
                  backgroundColor: '#2d343c',
                  padding: '25px',
                  borderRadius: '24px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '150px'
                }}>
                  <h3 style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '1px' }}>
                    Média {modo === "diario" ? "Diária" : "Semanal"}
                  </h3>
                  <p style={{ color: 'white', fontSize: '28px', fontWeight: '900', margin: 0 }}>
                    {media.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>

              </div>
            </div>
          </div>
        ))
      }

      {
        dados.length === 0 && (
          <div className="text-center py-20 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800 text-zinc-500">
            Nenhum dado encontrado para os filtros selecionados.
          </div>
        )
      }
    </div >
  );
}