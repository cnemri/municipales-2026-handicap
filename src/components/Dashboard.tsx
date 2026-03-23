"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactMarkdown from 'react-markdown';
import { Map as MapIcon, BarChart3, FileText, Info, ExternalLink, X, ChevronDown, File as FileIcon, CheckCircle2, XCircle, MapPin, ZoomIn, ZoomOut, Quote } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// --- CONSTANTS & TYPES ---
const DEPT_GEO_URL = "/data/france-departements.json";
const COMM_GEO_URL = "/data/france-communes.json";
const BRAND_BLUE = "#0055A4";
const BRAND_RED = "#EF4135";

const colorScale = scaleLinear<string>()
  .domain([0, 100])
  .range(["#f0f9ff", BRAND_BLUE]);

type RawRecord = {
  id: string;
  file_name: string;
  tour: string;
  department: string;
  commune: string;
  commune_code?: string;
  party: string;
  orientation: string;
  disability_mentioned: boolean;
  measures: string[];
  pdf_url: string;
};

type Stats = { total: number; mentioned: number; percentage: number };

type ProcessedData = {
  raw_records: RawRecord[];
  department_stats: Record<string, Stats>;
  commune_stats: Record<string, Stats>;
};

// --- COMPONENT ---
export default function Dashboard() {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [qualitativeText, setQualitativeText] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Main UI State
  const [activeTab, setActiveTab] = useState<"map" | "charts" | "qualitative" | "about">("map");
  
  // Modal State (replaces global filters)
  const [selectedGeoForModal, setSelectedGeoForModal] = useState<{code: string, name: string, type: 'dept'|'commune'} | null>(null);
  const [modalFilterTour, setModalFilterTour] = useState<"all" | "tour_1" | "tour_2">("all");
  const [modalFilterOrientation, setModalFilterOrientation] = useState<string>("All");

  // Map Controls
  const [mapPrecision, setMapPrecision] = useState<'dept' | 'commune'>('dept');
  const [position, setPosition] = useState({ coordinates: [2.4, 46.5] as [number, number], zoom: 1 });
  const [tooltipContent, setTooltipContent] = useState("");

  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadData() {
      try {
        const [resData, resMd] = await Promise.all([
          fetch("/data/processed_data.json").then(res => res.json()),
          fetch("/data/qualitative_summary.md").then(res => res.text())
        ]);
        setData(resData);
        setQualitativeText(resMd);
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleZoomIn = () => {
    if (position.zoom >= 10) return;
    setPosition(pos => ({ ...pos, zoom: pos.zoom * 1.5 }));
  };

  const handleZoomOut = () => {
    if (position.zoom <= 1) return;
    setPosition(pos => ({ ...pos, zoom: pos.zoom / 1.5 }));
  };

  const handleMoveEnd = (newPosition: { coordinates: [number, number], zoom: number }) => {
    setPosition(newPosition);
  };

  // --- DERIVED DATA ---
  
  // Unfiltered records (for charts and global stats)
  const allRecords = useMemo(() => data ? data.raw_records : [], [data]);

  // Local chart records (Filtered by Geo and Tour, but NOT orientation, to show full bar chart comparison)
  const localChartRecords = useMemo(() => {
    if (!selectedGeoForModal || !data) return [];
    return data.raw_records.filter(r => {
      if (selectedGeoForModal.type === 'dept' && r.department !== selectedGeoForModal.code) return false;
      if (selectedGeoForModal.type === 'commune' && r.commune_code !== selectedGeoForModal.code) return false;
      if (modalFilterTour !== "all" && r.tour !== modalFilterTour) return false;
      return true;
    });
  }, [data, selectedGeoForModal, modalFilterTour]);

  const modalPieData = useMemo(() => {
    const mentioned = localChartRecords.filter(r => r.disability_mentioned).length;
    const notMentioned = localChartRecords.length - mentioned;
    return [
      { name: "Mentionné", value: mentioned, color: BRAND_BLUE },
      { name: "Ignoré", value: notMentioned, color: BRAND_RED }
    ];
  }, [localChartRecords]);

  const modalBarData = useMemo(() => {
    const counts: Record<string, { total: number; mentioned: number }> = {};
    localChartRecords.forEach(r => {
      if (!counts[r.orientation]) counts[r.orientation] = { total: 0, mentioned: 0 };
      counts[r.orientation].total += 1;
      if (r.disability_mentioned) counts[r.orientation].mentioned += 1;
    });
    return Object.entries(counts).map(([name, stats]) => ({
      name: name === "Radical Left" ? "G. Rad" : name === "Radical Right" ? "D. Rad" : name === "Unknown" ? "Div." : name,
      Percentage: stats.total > 0 ? Number(((stats.mentioned / stats.total) * 100).toFixed(1)) : 0,
      Total: stats.total
    })).sort((a, b) => b.Percentage - a.Percentage);
  }, [localChartRecords]);

  // Modal filtered records
  const modalRecords = useMemo(() => {
    if (!selectedGeoForModal || !data) return [];
    
    return data.raw_records.filter(r => {
      // Geo match
      if (selectedGeoForModal.type === 'dept' && r.department !== selectedGeoForModal.code) return false;
      if (selectedGeoForModal.type === 'commune' && r.commune_code !== selectedGeoForModal.code) return false;
      
      // Filter match
      if (modalFilterTour !== "all" && r.tour !== modalFilterTour) return false;
      if (modalFilterOrientation !== "All" && r.orientation !== modalFilterOrientation) return false;
      
      return true;
    });
  }, [data, selectedGeoForModal, modalFilterTour, modalFilterOrientation]);

  // Dynamic Map Stats (always shows overall stats since there are no global filters anymore)
  const dynamicMapStats = useMemo(() => {
    if (!data) return {};
    return mapPrecision === 'dept' ? data.department_stats : data.commune_stats;
  }, [data, mapPrecision]);

  // Qualitative Markdown Parsing
  const parsedQualitative = useMemo(() => {
    if (!qualitativeText) return { intro: "", sections: [] };
    const parts = qualitativeText.split("## Orientation : ");
    const intro = parts[0].replace("# Analyse Qualitative des Mesures sur le Handicap par Orientation Politique\n\n", "");
    const sections = parts.slice(1).map(part => {
      const splitIdx = part.indexOf("\n\n");
      const title = part.substring(0, splitIdx).trim();
      const content = part.substring(splitIdx).trim();
      return { title, content };
    });
    return { intro, sections };
  }, [qualitativeText]);

  const toggleAccordion = (title: string) => setExpandedAccordions(prev => ({ ...prev, [title]: !prev[title] }));

  // Charts Data (Uses all records)
  const pieData = useMemo(() => {
    const mentioned = allRecords.filter(r => r.disability_mentioned).length;
    const notMentioned = allRecords.length - mentioned;
    return [
      { name: "Mentionne le handicap", value: mentioned, color: BRAND_BLUE },
      { name: "Ne mentionne pas", value: notMentioned, color: BRAND_RED }
    ];
  }, [allRecords]);

  const orientationBarData = useMemo(() => {
    const counts: Record<string, { total: number; mentioned: number }> = {};
    allRecords.forEach(r => {
      if (!counts[r.orientation]) counts[r.orientation] = { total: 0, mentioned: 0 };
      counts[r.orientation].total += 1;
      if (r.disability_mentioned) counts[r.orientation].mentioned += 1;
    });
    return Object.entries(counts).map(([name, stats]) => ({
      name,
      Percentage: stats.total > 0 ? Number(((stats.mentioned / stats.total) * 100).toFixed(1)) : 0,
      Total: stats.total
    })).sort((a, b) => b.Percentage - a.Percentage);
  }, [allRecords]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-xl font-bold text-[#0055A4]">Chargement des données...</div>;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-100 relative">
      
      {/* SIDEBAR */}
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 shrink-0">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center space-x-2 mb-3">
            <div className="w-6 h-4 bg-[#0055A4] rounded-sm"></div>
            <div className="w-6 h-4 bg-slate-200 rounded-sm"></div>
            <div className="w-6 h-4 bg-[#EF4135] rounded-sm"></div>
          </div>
          <h1 className="text-2xl font-black text-slate-800 leading-tight tracking-tight">Handicap &<br/>Municipales 2026</h1>
          <p className="text-xs text-slate-500 mt-2 uppercase font-semibold tracking-widest">Observatoire National</p>
        </div>

        {/* NAVIGATION (No Filters Here Anymore) */}
        <nav className="flex-1 overflow-y-auto py-6">
          <ul className="space-y-2 px-4">
            {[
              { id: "map", icon: MapIcon, label: "Carte Interactive" },
              { id: "charts", icon: BarChart3, label: "Vue Quantitative" },
              { id: "qualitative", icon: FileText, label: "Synthèse Qualitative" },
              { id: "about", icon: Info, label: "À Propos" },
            ].map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id as "map" | "charts" | "qualitative" | "about")}
                  className={cn(
                    "w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200",
                    activeTab === item.id 
                      ? "bg-[#0055A4] text-white shadow-md shadow-blue-900/20 translate-x-1" 
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", activeTab === item.id ? "text-white" : "text-slate-400")} />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 h-screen overflow-y-auto p-4 md:p-8 bg-slate-50/50 relative">
        
        {/* STATS HEADER (Global) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-1 bg-[#0055A4] mb-4 rounded-full"></div>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">Programmes Analysés</p>
            <p className="text-4xl font-black text-slate-800 mt-2">{allRecords.length}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-1 bg-slate-400 mb-4 rounded-full"></div>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">Inclusion du Handicap</p>
            <p className="text-4xl font-black text-slate-800 mt-2">
              {allRecords.filter(r => r.disability_mentioned).length}
            </p>
            <p className="text-xs font-medium text-slate-400 mt-1">programmes le mentionnent</p>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-10 h-1 bg-[#EF4135] mb-4 rounded-full"></div>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">Taux Global</p>
            <p className="text-4xl font-black text-slate-800 mt-2">
              {allRecords.length > 0 ? ((allRecords.filter(r => r.disability_mentioned).length / allRecords.length) * 100).toFixed(1) : 0}%
            </p>
            <p className="text-xs font-medium text-slate-400 mt-1">au niveau national</p>
          </div>
        </div>

        {/* TAB CONTENTS */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[600px] overflow-hidden">
          
          {/* TAB: MAP */}
          {activeTab === "map" && (
            <div className="p-8 flex flex-col items-center relative">
              <div className="w-full flex justify-between items-end mb-6">
                <div className="text-left">
                  <h2 className="text-2xl font-black text-[#0055A4] mb-2">Cartographie de l&apos;Inclusion</h2>
                  <p className="text-sm font-medium text-slate-500">Cliquez sur une zone pour explorer les programmes en détail.</p>
                </div>
                
                {/* Precision Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
                  <button 
                    onClick={() => setMapPrecision('dept')}
                    className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-colors", mapPrecision === 'dept' ? "bg-white text-[#0055A4] shadow-sm" : "text-slate-500 hover:text-slate-700")}
                  >
                    Départements
                  </button>
                  <button 
                    onClick={() => setMapPrecision('commune')}
                    className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-colors", mapPrecision === 'commune' ? "bg-white text-[#0055A4] shadow-sm" : "text-slate-500 hover:text-slate-700")}
                  >
                    Communes
                  </button>
                </div>
              </div>
              
              {/* Tooltip floating */}
              <div className="absolute top-28 right-8 bg-slate-900 text-white text-sm font-bold px-4 py-3 rounded-xl shadow-xl pointer-events-none transition-opacity duration-200 z-20" style={{ opacity: tooltipContent ? 1 : 0 }}>
                {tooltipContent || "Survolez la carte"}
              </div>

              {/* Map Container */}
              <div className="w-full max-w-4xl aspect-[4/3] bg-slate-50/80 rounded-2xl overflow-hidden border border-slate-200 relative group flex items-center justify-center">
                
                {/* Zoom Controls */}
                <div className="absolute top-4 left-4 z-10 flex flex-col space-y-2">
                  <button onClick={handleZoomIn} className="p-2 bg-white rounded-lg shadow border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#0055A4]">
                    <ZoomIn className="w-5 h-5"/>
                  </button>
                  <button onClick={handleZoomOut} className="p-2 bg-white rounded-lg shadow border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#0055A4]">
                    <ZoomOut className="w-5 h-5"/>
                  </button>
                </div>

                <ComposableMap 
                  projection="geoConicConformal" 
                  projectionConfig={{ 
                    center: [2.4, 46.5], 
                    scale: 3200 
                  }} 
                  className="w-full h-full outline-none"
                  viewBox="0 0 800 600"
                >
                  <ZoomableGroup 
                    zoom={position.zoom} 
                    center={position.coordinates} 
                    onMoveEnd={handleMoveEnd} 
                    maxZoom={10}
                    className="outline-none"
                  >
                    <Geographies geography={mapPrecision === 'dept' ? DEPT_GEO_URL : COMM_GEO_URL}>
                      {({ geographies }) =>
                        geographies.map((geo) => {
                          const geoCode = geo.properties.code;
                          const geoName = geo.properties.nom;
                          
                          // Look up stats
                          const stats = dynamicMapStats[geoCode];
                          // If we have data, color it. If no data, render it gray. 
                          const color = stats && stats.total > 0 ? colorScale(stats.percentage) : "#e2e8f0";
                          const strokeColor = mapPrecision === 'dept' ? "#ffffff" : "rgba(255,255,255,0.4)";
                          const hoverStroke = mapPrecision === 'dept' ? 1.5 : 0.5;

                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill={color}
                              stroke={strokeColor}
                              strokeWidth={mapPrecision === 'dept' ? 0.8 : 0.1}
                              className="outline-none transition-all duration-200 cursor-pointer"
                              onMouseEnter={() => {
                                if (stats && stats.total > 0) {
                                  setTooltipContent(`${geoName} (${geoCode}): ${stats.percentage.toFixed(1)}% (${stats.total} prog.)`);
                                } else {
                                  setTooltipContent(`${geoName} (${geoCode}): Aucune donnée`);
                                }
                              }}
                              onMouseLeave={() => {
                                setTooltipContent("");
                              }}
                              onClick={() => {
                                if (stats && stats.total > 0) {
                                  setSelectedGeoForModal({ code: geoCode, name: geoName, type: mapPrecision });
                                  // Reset modal filters on new click
                                  setModalFilterTour("all");
                                  setModalFilterOrientation("All");
                                }
                              }}
                              style={{
                                hover: { fill: BRAND_RED, stroke: "#fff", strokeWidth: hoverStroke, outline: "none" },
                                pressed: { fill: BRAND_BLUE, outline: "none" },
                              }}
                            />
                          );
                        })
                      }
                    </Geographies>
                  </ZoomableGroup>
                </ComposableMap>
              </div>
              
              {/* Map Legend */}
              <div className="mt-8 flex flex-col items-center justify-center bg-white py-3 px-6 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest mb-3">Taux de programmes mentionnant le handicap</span>
                <div className="flex items-center space-x-3 text-xs font-bold text-slate-500">
                  <span>0%</span>
                  <div className="w-56 h-3 rounded-full bg-gradient-to-r from-[#f0f9ff] to-[#0055A4]"></div>
                  <span>100%</span>
                  <span className="ml-6 flex items-center"><div className="w-3 h-3 bg-slate-200 border border-slate-300 mr-2 rounded-full"></div> Aucune donnée</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CHARTS */}
          {activeTab === "charts" && (
            <div className="p-8">
               <div className="w-full text-center mb-10">
                <h2 className="text-2xl font-black text-[#0055A4] mb-2">Analyse Quantitative Globale</h2>
                <p className="text-sm font-medium text-slate-500">Statistiques nationales basées sur la totalité des programmes extraits.</p>
              </div>
               
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* Pie Chart */}
                 <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 text-center mb-6">Proportion Globale des Mentions</h3>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" labelLine={false} label={({ percent }) => percent !== undefined ? `${(percent * 100).toFixed(0)}%` : ""} outerRadius={120} dataKey="value">
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value: any) => [`${value} programmes`, "Total"]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ paddingTop: '20px', fontWeight: '600', fontSize: '14px' }}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                 </div>

                 {/* Bar Chart */}
                 <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 text-center mb-6">Taux d&apos;inclusion par Orientation</h3>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={orientationBarData} margin={{ top: 20, right: 30, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 600, fill: '#64748b'}} tickLine={false} axisLine={false} />
                          <YAxis tick={{fontSize: 12, fill: '#64748b'}} unit="%" tickLine={false} axisLine={false} />
                          <RechartsTooltip cursor={{fill: '#f8fafc'}} formatter={(value: any) => [`${value}%`, "Taux"]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}/>
                          <Bar dataKey="Percentage" fill={BRAND_BLUE} radius={[6, 6, 0, 0]} maxBarSize={60} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                 </div>
               </div>
            </div>
          )}

          {/* TAB: QUALITATIVE (Accordions) */}
          {activeTab === "qualitative" && (
            <div className="p-8 max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-2xl font-black text-[#0055A4] mb-4">Synthèse Qualitative des Programmes</h2>
                <div className="text-slate-700 text-lg font-medium p-2 text-center leading-relaxed">
                  <ReactMarkdown>{parsedQualitative.intro}</ReactMarkdown>
                </div>
              </div>

              <div className="space-y-4">
                {parsedQualitative.sections.map((section, idx) => {
                  const isOpen = expandedAccordions[section.title] || false;
                  return (
                    <div key={idx} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md bg-white">
                      <button 
                        onClick={() => toggleAccordion(section.title)} 
                        className={cn(
                          "w-full px-6 py-5 flex items-center justify-between transition-colors",
                          isOpen ? "bg-blue-50/50 border-b border-blue-100" : "bg-white hover:bg-slate-50"
                        )}
                      >
                        <span className="text-lg font-bold text-slate-800 flex items-center">
                          <div className={cn("w-2 h-6 rounded-full mr-4 transition-colors", isOpen ? "bg-[#0055A4]" : "bg-[#EF4135]")}></div>
                          {section.title}
                        </span>
                        <div className={cn("p-2 rounded-full transition-transform duration-300", isOpen ? "bg-white shadow-sm rotate-180" : "bg-slate-100")}>
                          <ChevronDown className="w-5 h-5 text-slate-600" />
                        </div>
                      </button>
                      
                      <div className={cn(
                        "transition-all duration-300 ease-in-out origin-top overflow-hidden",
                        isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
                      )}>
                        <div className="p-8 bg-slate-50/50">
                          <ReactMarkdown
                            components={{
                              h3: ({node, ...props}) => { void node; return <h3 className="text-xl font-black text-slate-800 mt-8 mb-5 flex items-center" {...props} />; },
                              ul: ({node, ...props}) => { void node; return <ul className="flex flex-col gap-4 my-6" {...props} />; },
                              li: ({node, children, ...props}) => {
                                void node;
                                return (
                                <li className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 flex items-start group" {...props}>
                                  <div className="bg-slate-50 text-[#0055A4] p-2.5 rounded-xl mr-4 border border-slate-100 group-hover:bg-[#0055A4] group-hover:text-white transition-colors shrink-0 mt-0.5">
                                    <CheckCircle2 className="w-5 h-5" />
                                  </div>
                                  <div className="text-slate-700 text-sm leading-relaxed flex-1 [&>strong]:text-slate-900 [&>strong]:font-black">{children}</div>
                                </li>
                              );},
                              p: ({node, ...props}) => { void node; return <p className="text-slate-600 text-base leading-relaxed mb-4" {...props} />; },
                              blockquote: ({node, children, ...props}) => {
                                void node;
                                return (
                                <blockquote className="relative bg-gradient-to-br from-blue-50 to-white border-l-4 border-[#0055A4] p-8 rounded-r-2xl my-8 shadow-sm overflow-hidden" {...props}>
                                  <div className="absolute -top-4 -right-4 text-blue-100/50 transform rotate-12 pointer-events-none">
                                    <Quote className="w-32 h-32" />
                                  </div>
                                  <div className="relative z-10 text-blue-900 font-medium text-lg leading-relaxed italic">{children}</div>
                                </blockquote>
                              );},
                              strong: ({node, ...props}) => { void node; return <strong className="font-black text-[#0055A4]" {...props} />; }
                            }}
                          >
                            {section.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {parsedQualitative.sections.length === 0 && (
                  <div className="text-center p-12 text-slate-500 font-medium bg-slate-50 rounded-2xl border border-slate-200">
                    Aucune synthèse qualitative disponible pour le moment.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: ABOUT */}
          {activeTab === "about" && (
            <div className="p-12 max-w-3xl mx-auto flex flex-col items-center text-center mt-4">
              <div className="w-28 h-28 bg-gradient-to-br from-[#0055A4] to-[#003366] rounded-full flex items-center justify-center text-white text-4xl font-black mb-6 shadow-xl shadow-blue-900/20 border-4 border-white">
                CN
              </div>
              <h2 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">Chouaieb Nemri</h2>
              <div className="flex items-center justify-center space-x-3 mb-8">
                <span className="px-4 py-1.5 bg-blue-100 text-blue-800 font-bold rounded-full text-sm">AI @ Google</span>
                <span className="text-slate-300 font-bold">|</span>
                <span className="px-4 py-1.5 bg-red-100 text-red-800 font-bold rounded-full text-sm">Disability Rights Advocate</span>
              </div>
              
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-left w-full">
                <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                  <div className="w-1.5 h-6 bg-[#0055A4] rounded-full mr-3"></div>
                  À Propos du Projet
                </h3>
                <p className="text-slate-600 leading-relaxed mb-4 text-lg">
                  Ce projet a été conçu pour apporter de la transparence et des données quantitatives sur la place accordée aux personnes en situation de handicap dans les discours politiques locaux en France.
                </p>
                <p className="text-slate-600 leading-relaxed text-lg">
                  En utilisant des techniques avancées d&apos;Intelligence Artificielle pour analyser automatiquement des milliers de professions de foi officielles, nous pouvons observer quelles familles politiques placent réellement l&apos;inclusion au cœur de leur projet municipal.
                </p>
              </div>

              <a 
                href="https://linkedin.com/in/nemri" 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-10 px-8 py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 hover:bg-slate-800 transition-all inline-flex items-center"
              >
                Me contacter sur LinkedIn <ExternalLink className="w-5 h-5 ml-3"/>
              </a>
            </div>
          )}
        </div>
      </main>

      {/* REGION/COMMUNE SLIDE-OVER MODAL FOR PDFS */}
      {selectedGeoForModal && (
        <>
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity" 
            onClick={() => setSelectedGeoForModal(null)} 
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-slate-50 z-50 shadow-2xl flex flex-col border-l border-slate-200 transform transition-transform duration-300">
            
            {/* Modal Header */}
            <div className="px-6 py-5 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
              <div>
                <h2 className="text-2xl font-black text-[#0055A4] flex items-center">
                  {selectedGeoForModal.name} <span className="ml-2 text-slate-400 font-bold text-lg">({selectedGeoForModal.code})</span>
                </h2>
                <p className="text-sm font-medium text-slate-500 mt-1 flex items-center">
                  <MapPin className="w-3 h-3 mr-1" />
                  {selectedGeoForModal.type === 'dept' ? 'Département' : 'Commune'}
                </p>
              </div>
              <button 
                onClick={() => setSelectedGeoForModal(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Filters (Explicitly local to the modal) */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 flex space-x-4 shadow-sm z-10">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Filtrer par Tour</label>
                <select 
                  className="w-full text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg p-2 focus:border-[#0055A4] outline-none"
                  value={modalFilterTour}
                  onChange={(e) => setModalFilterTour(e.target.value as "all" | "tour_1" | "tour_2")}
                >
                  <option value="all">Tous les tours</option>
                  <option value="tour_1">1er Tour</option>
                  <option value="tour_2">2nd Tour</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Filtrer par Orientation</label>
                <select 
                  className="w-full text-sm font-medium bg-slate-50 border border-slate-200 rounded-lg p-2 focus:border-[#0055A4] outline-none"
                  value={modalFilterOrientation}
                  onChange={(e) => setModalFilterOrientation(e.target.value)}
                >
                  <option value="All">Toutes orientations</option>
                  <option value="Left">Gauche</option>
                  <option value="Center">Centre</option>
                  <option value="Right">Droite</option>
                  <option value="Radical Left">Gauche Radicale</option>
                  <option value="Radical Right">Droite Radicale</option>
                  <option value="Unknown">Divers</option>
                </select>
              </div>
            </div>

            {/* Modal Content - Local Charts & PDF Cards */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Local Charts */}
              {localChartRecords.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-sm font-bold text-slate-800 text-center mb-1">Proportion Globale</h3>
                    <div className="flex-1 min-h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={modalPieData} cx="50%" cy="50%" labelLine={false} label={({ percent }) => percent !== undefined ? `${(percent * 100).toFixed(0)}%` : ""} outerRadius={60} dataKey="value">
                            {modalPieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <RechartsTooltip formatter={(value: any) => [`${value} progs`, "Total"]} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 4px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                          <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: '11px', fontWeight: '600' }}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-sm font-bold text-slate-800 text-center mb-1">Taux par Orientation</h3>
                    <div className="flex-1 min-h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modalBarData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{fontSize: 10, fontWeight: 600, fill: '#64748b'}} tickLine={false} axisLine={false} />
                          <YAxis tick={{fontSize: 10, fill: '#64748b'}} unit="%" tickLine={false} axisLine={false} />
                          <RechartsTooltip cursor={{fill: '#f8fafc'}} formatter={(value: any) => [`${value}%`, "Taux"]} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 4px rgb(0 0 0 / 0.1)', fontSize: '12px' }}/>
                          <Bar dataKey="Percentage" fill={BRAND_BLUE} radius={[4, 4, 0, 0]} maxBarSize={30} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-2 border-b border-slate-200 pb-2">
                <h3 className="font-bold text-slate-700">Programmes ciblés ({modalRecords.length})</h3>
              </div>

              {modalRecords.map(record => (
                <div key={record.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-4">
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{record.commune}</h4>
                      <div className="flex items-center mt-2 space-x-2 flex-wrap gap-y-2">
                        <span className="text-sm font-bold text-slate-700">{record.party}</span>
                        <span className="text-slate-300">•</span>
                        <span className={cn("text-xs px-2.5 py-1 font-bold rounded-md", 
                          record.orientation.includes("Left") ? "bg-red-50 text-red-700 border border-red-100" :
                          record.orientation.includes("Right") ? "bg-blue-50 text-blue-700 border border-blue-100" :
                          record.orientation === "Center" ? "bg-orange-50 text-orange-700 border border-orange-100" : "bg-slate-100 text-slate-600 border border-slate-200"
                        )}>
                          {record.orientation}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        {record.tour === "tour_1" ? "1er Tour" : "2nd Tour"}
                      </span>
                      {record.disability_mentioned ? (
                        <div className="flex items-center text-[#0055A4] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          <span className="text-xs font-bold">Mentionné</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-red-700 bg-red-50 border border-red-200 px-3 py-1 rounded-full">
                          <XCircle className="w-4 h-4 mr-1.5" />
                          <span className="text-xs font-bold">Ignoré</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Body - Measures */}
                  <div className="mb-5">
                    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mesures extraites</h5>
                    {record.measures && record.measures.length > 0 ? (
                      <ul className="space-y-2">
                        {record.measures.map((m, i) => (
                          <li key={i} className="text-sm text-slate-700 flex items-start">
                            <span className="text-[#0055A4] mr-2 mt-0.5">•</span>
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400 italic">Aucune mesure spécifique n&apos;a été détectée dans ce programme.</p>
                    )}
                  </div>

                  {/* Card Footer - Action */}
                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <a 
                      href={record.pdf_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center px-4 py-2 bg-slate-50 hover:bg-[#0055A4] text-slate-700 hover:text-white border border-slate-200 hover:border-[#0055A4] rounded-lg text-sm font-bold transition-colors"
                    >
                      <FileIcon className="w-4 h-4 mr-2" />
                      Lire la profession de foi
                    </a>
                  </div>
                </div>
              ))}

              {modalRecords.length === 0 && (
                <div className="text-center p-12 bg-white rounded-2xl border border-slate-200 border-dashed">
                  <FileIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Aucun programme trouvé avec les filtres sélectionnés.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}