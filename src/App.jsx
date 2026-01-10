import { useEffect, useState } from "react";
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

  return (
    <div className="bg-zinc-950 min-h-screen text-white p-6">
      {/* HEADER */}
      <div className="flex justify-between items-start mb-10">
        <h1 className="text-4xl font-bold">📊 Controle Financeiro</h1>
        <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-sm text-zinc-400">
          <div>🕒 Última: <span className="text-white font-mono">{formatarHora(ultimaAtualizacao)}</span></div>
          <div>⏭️ Próxima: <span className="text-green-500 font-mono">{formatarCountdown(tempoRestante)}</span></div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap gap-6 mb-10 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-900">
        <div className="flex flex-col gap-2">
          <label className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Categoria</label>
          <select
            value={categoriaSelecionada}
            onChange={e => setCategoriaSelecionada(e.target.value)}
            className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 min-w-[280px] focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-zinc-500 text-xs uppercase font-bold tracking-widest">Período</label>
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
      {Object.entries(dadosPorMes).map(([mesAno, linhas]) => (
        <div key={mesAno} className="bg-zinc-900 rounded-3xl p-8 mb-14 border border-zinc-800 shadow-xl">
          <h2 className="text-2xl font-light mb-8">Dados de <span className="font-bold text-white">{mesAno}</span></h2>

          {/* Ajuste aqui: 
        1. Definimos uma altura fixa na div pai (h-[400px]) 
        2. Garantimos que ela tenha min-width: 0 para evitar estouro de container flex 
    */}
          <div style={{ width: '100%', height: 400, minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={linhas} margin={{ top: 60, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="label" stroke="#52525b" tick={{ fontSize: 12 }} />
                <YAxis stroke="#52525b" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                  formatter={v => `R$ ${v.toFixed(2)}`}
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
                      stroke="#000000ff"
                      fontSize={13}
                      formatter={(v) => v > 0 ? `R$ ${v.toFixed(2).replace(".", ",")}` : ''}
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}

      {dados.length === 0 && (
        <div className="text-center py-20 bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800 text-zinc-500">
          Nenhum dado encontrado para os filtros selecionados.
        </div>
      )}
    </div>
  );
}