import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useTranslation } from '@/lib/use-translation'

type CompactConfirmDialogProps = {
    isOpen: boolean
    isPending: boolean
    onClose: () => void
    onConfirm: () => Promise<void>
}

export function CompactConfirmDialog(props: CompactConfirmDialogProps) {
    const { t } = useTranslation()

    return (
        <ConfirmDialog
            isOpen={props.isOpen}
            isPending={props.isPending}
            onClose={props.onClose}
            onConfirm={props.onConfirm}
            title={t('dialog.compact.title')}
            description={t('dialog.compact.description')}
            confirmLabel={t('dialog.compact.confirm')}
            confirmingLabel={t('dialog.compact.confirming')}
        />
    )
}
