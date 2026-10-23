export function Icon({name,size=18}:{name:"grid"|"spark"|"plus"|"arrow"|"clock"|"settings"|"file"|"check"|"download";size?:number}){
const paths:Record<string,React.ReactNode>={
grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
spark:<><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z"/></>,
plus:<path d="M12 5v14M5 12h14"/>,
arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></>,
file:<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></>,
check:<path d="m5 12 4 4L19 6"/>,
download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
};
return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
