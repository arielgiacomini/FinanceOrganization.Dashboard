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

export default function App() {
  /* ===============================
     ESTADOS
  =============================== */
  const [dados, setDados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaSelecionada, setCategoriaSelecionada] =
    useState("Alimentação:Jantar"); // ✅ ajuste 1
  const [modo, setModo] = useState("semanal");

  /* ===============================
     FETCH CATEGORIAS
  =============================== */
  useEffect(() => {
    fetch("http://api.financeiro.arielgiacomini.com.br/v1/category/search?enable=true")
      .then(res => res.json())
      .then(data => setCategorias(data))
      .catch(console.error);
  }, []);

  /* ===============================
     FETCH DASHBOARD
  =============================== */
  useEffect(() => {
    const url =
      `http://api.financeiro.arielgiacomini.com.br/v1/dashboard/billToPay-day-week-category?categoria=${encodeURIComponent(categoriaSelecionada)}`;

    fetch(url, {
      headers: {
        "mesAno": "Janeiro/2026" // ✅ ajuste 2
      }
    })
      .then(res => res.json())
      .then(setDados)
      .catch(console.error);
  }, [categoriaSelecionada]);

  /* ===============================
     HELPERS
  =============================== */
  function formatarData(dataIso) {
    return new Date(dataIso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit"
    });
  }

  function extrairNumeroSemana(weekName) {
    return Number(weekName.match(/\d+/)?.[0]) || 0;
  }

  /* ===============================
     AGRUPAMENTO
  =============================== */
  const dadosPorMes = {};

  dados.forEach(item => {
    if (!dadosPorMes[item.monthYear]) {
      dadosPorMes[item.monthYear] = [];
    }

    if (modo === "diario") {
      dadosPorMes[item.monthYear].push({
        data: new Date(item.date),
        label: formatarData(item.date),
        valor: Number(item.valueSpent) || 0
      });
    }

    if (modo === "semanal") {
      const numeroSemana = extrairNumeroSemana(item.weekName);

      let semana = dadosPorMes[item.monthYear]
        .find(s => s.numeroSemana === numeroSemana);

      if (!semana) {
        semana = {
          numeroSemana,
          label: item.weekName,
          valor: 0
        };
        dadosPorMes[item.monthYear].push(semana);
      }

      // 🔥 soma correta
      semana.valor += Number(item.valueSpent) || 0;
    }
  });

  /* ===============================
     ORDENAÇÃO
  =============================== */
  Object.keys(dadosPorMes).forEach(mes => {
    dadosPorMes[mes].sort((a, b) =>
      modo === "diario"
        ? a.data - b.data
        : a.numeroSemana - b.numeroSemana
    );
  });

  /* ===============================
     RENDER
  =============================== */
  return (
    <div className="bg-zinc-950 min-h-screen text-white p-6">
      <h1 className="text-4xl font-bold mb-8">
        📊 Controle Financeiro
      </h1>

      {/* FILTRO */}
      <div className="mb-6 max-w-md">
        <label className="block mb-2 text-zinc-400">
          Categoria
        </label>
        <select
          value={categoriaSelecionada}
          onChange={e => setCategoriaSelecionada(e.target.value)}
          className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700"
        >
          {categorias.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* TOGGLE */}
      <div className="mb-10 flex gap-4">
        <button
          onClick={() => setModo("semanal")}
          className={`px-6 py-2 rounded-xl ${
            modo === "semanal" ? "bg-green-600" : "bg-zinc-800"
          }`}
        >
          Semanal
        </button>

        <button
          onClick={() => setModo("diario")}
          className={`px-6 py-2 rounded-xl ${
            modo === "diario" ? "bg-green-600" : "bg-zinc-800"
          }`}
        >
          Diário
        </button>
      </div>

      {/* GRÁFICOS */}
      {Object.entries(dadosPorMes).map(([mesAno, linhas]) => (
        <div
          key={mesAno}
          className="bg-zinc-900 rounded-2xl p-8 mb-14"
        >
          <h2 className="text-3xl mb-8">📅 {mesAno}</h2>

          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <LineChart
                data={linhas}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={0} />
                <YAxis />
                <Tooltip formatter={v => `R$ ${v.toFixed(2)}`} />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="#22c55e"
                  strokeWidth={4}
                  dot={{ r: 6 }}
                >
                  <LabelList
                    dataKey="valor"
                    position="top"
                    formatter={v => `R$ ${v.toFixed(2)}`}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  );
}