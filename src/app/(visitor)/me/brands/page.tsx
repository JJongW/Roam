import { BrandHeartList } from "@/components/me/brand-heart-list";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.heartedBrands };

/** UI 14-10 하트 남긴 브랜드. 로그인한 분만(proxy가 /login으로 보낸다). 목록은 계정에 있다. */
export default function BrandsPage() {
  return <BrandHeartList />;
}
