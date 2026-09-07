import { IntakeUploader } from "@/components/admin/intake-uploader";

export default function AdminIntakePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">인입</h1>
        <p className="text-sm text-muted-foreground">
          정규형 파일 하나로 부스와 저작 정보를 넣습니다. 있는 부스는 빈 칸만
          채우고, 사람이 쓴 값은 건드리지 않습니다.
        </p>
      </header>
      <IntakeUploader />
    </div>
  );
}
