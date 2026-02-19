"use client";

import { useParams } from "next/navigation";
import CityForm from "../_components/CityForm";

export default function EditarCidadePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  return <CityForm mode="edit" cityId={id} />;
}
