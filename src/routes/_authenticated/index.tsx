import {createFileRoute} from '@tanstack/react-router'
import {Restaurant} from '@/features/restaurant'
export const Route=createFileRoute('/_authenticated/')({component:()=> <Restaurant section='overview'/>})
