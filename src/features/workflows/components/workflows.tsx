"use client"
import { EntityContainer, EntityHeader } from "@/components/entity-components"
import { useCreateWorkflow, useSuspenseWorkflows } from "../hooks/use-workflows"
import { useUpgradeModal } from "../hooks/use-upgrade-modal"
import { useRouter } from "next/navigation"

export const WorkflowsList = () => {
    const workflows = useSuspenseWorkflows()

    return (
        <div className="flex-1 justify-center items-center flex">
            {JSON.stringify(workflows.data, null, 2)}
        </div>
    )
}

export const WorkflowsHeader = ({ disabled }: { disabled?: boolean }) => {
    const createWorkflow = useCreateWorkflow()
    const router = useRouter()
    const { modal, handleError } = useUpgradeModal()

    const handleCreate = () => {
        createWorkflow.mutate(undefined, {
            onSuccess: (data) => {
                router.push(`/workflows/${data.id}`)
            },
            onError: (error) => {
                handleError(error)
            },
        })
    }

    return (
        <>
        {modal}
        <EntityHeader
            title="Workflows"
            description="Create and manage your workflows"
            newButtonLabel="New Workflow"
            onNew={handleCreate}
            disabled={disabled}
            isCreating={createWorkflow.isPending}
        />
        </>
    )
}

export const WorkflowsContainer = ({
    children
}: {
    children: React.ReactNode;
}) => {
    return (
        <EntityContainer
            header={<WorkflowsHeader />}
            search={<></>}
            pagination={<></>}
        >
            {children}
        </EntityContainer>
    )
}