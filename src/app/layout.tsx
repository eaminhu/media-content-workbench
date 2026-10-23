import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"选题工作台 · 内容工坊",description:"从一个好问题开始，记录选题、评测与每一次打磨。"};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="zh-CN"><body>{children}</body></html>;
}
