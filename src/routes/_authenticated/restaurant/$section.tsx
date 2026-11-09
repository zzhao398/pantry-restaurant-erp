import {createFileRoute} from '@tanstack/react-router'
import {Restaurant} from '@/features/restaurant'
export const Route=createFileRoute('/_authenticated/restaurant/$section')({component:Page})
function Page(){const {section}=Route.useParams();return <Restaurant section={section}/>}
